import WebKit
import Foundation // For JSONDecoder, RunLoop etc.

// 保留我們先前定義的 Codable 結構
// (確保這些結構與之前 URLSession 版本中的定義一致或更新以匹配 API)
struct RequestBody: Codable {
    let MemberGuid: String
    let LoginToken: String
    let JoinType: String
    let AreaCode: String
    let AreaName: String
    let CinemaID: String
    let CinemaName: String
    let ShowDate: String
    let FilmID: String
    let FilmName: String
    let OrderType: String
    let CardNo: String
    let ShowMethod: String
    let AppVersion: String
}

struct Session: Codable, Identifiable {
    let SessionID: String
    let FilmID: String
    let FilmNameID: String? // 可能為 null
    let FilmType: String?   // 可能為 null
    let CinemasID: String
    let ScreenNumber: Int
    let ScreenName: String? // 可能為 null
    let ScreenEName: String? // 可能為 null
    let _showDate: String // ISO 8601 format string
    let ShowDate: String // "yyyy/MM/dd" format string
    let ShowTime: String // "HH:mm:ss" format string
    let _endDate: String? // ISO 8601 format string, 可能為 null
    let EndDate: String? // "yyyy/MM/dd" format string, 可能為 null
    let EndTime: String? // "HH:mm:ss" format string, 可能為 null
    let _businessDate: String // ISO 8601 format string
    let BusinessDate: String // "yyyy/MM/dd" format string
    let SeatsAvailable: Int

    // 提供一個 id 屬性，方便在 SwiftUI List 等地方使用
    var id: String { SessionID }

    // 可以添加計算屬性來處理日期/時間格式
    var showDateTime: Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds] // 嘗試包含毫秒
        if let date = formatter.date(from: _showDate) {
            return date
        }
        // 如果上面格式失敗，嘗試不帶毫秒的格式
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: _showDate)
    }
}

// 定義 API 回應的頂層結構 (包含 Session 陣列)
struct ApiResponse: Codable {
    let result: Bool
    let messagecode: String?
    let message: String?
    let data: APIData? // 使用可選類型以防 data 為 null
}

struct APIData: Codable {
    let Session: [Session]? // 使用可選類型以防 Session 為 null
}

class MovieDataSniffer: NSObject, WKNavigationDelegate, WKScriptMessageHandler {

    private var webView: WKWebView!
    private let messageHandlerName = "jsonInterceptor"
    private var isLoading = false
    private var loadCompletionHandler: ((Error?) -> Void)?

    // 用於格式化 JSON
    private lazy var jsonEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return encoder
    }()

    private lazy var jsonDecoder = JSONDecoder()

    // 與 study.py 類似的關鍵字
    private let keywords = ["movie", "session", "showtime", "date", "theater", "film", "rating", "cinema", "screen", "seat", "schedule"]
    private let keywordThreshold = 3 // 需要多少個關鍵字才認為相關

    override init() {
        super.init()

        let config = WKWebViewConfiguration()
        let userContentController = WKUserContentController()

        // --- 注入 JavaScript 以攔截所有 Fetch 回應並檢查 JSON --- 
        let scriptSource = """
        (function() {
            const originalFetch = window.fetch;
            window.fetch = function() {
                const request = arguments[0];
                const url = request instanceof Request ? request.url : String(request);
                const method = request instanceof Request ? request.method : (arguments[1] ? arguments[1].method : 'GET');
                const messageHandlerName = "\(messageHandlerName)";
                
                // 打印請求攔截信息
                console.log(`[JS Interceptor] Fetching: ${method} ${url}`);

                return originalFetch.apply(this, arguments)
                    .then(response => {
                        const contentType = response.headers.get('content-type') || '';
                        const status = response.status;
                        console.log(`[JS Interceptor] Response from ${url}, Status: ${status}, Content-Type: ${contentType}`);
                        
                        // 檢查是否是 JSON
                        if (contentType.toLowerCase().includes('application/json') || contentType.toLowerCase().includes('text/json')) {
                            console.log(`[JS Interceptor] JSON detected from ${url}`);
                            // Clone 回應以讀取內容
                            response.clone().text().then(jsonString => {
                                console.log(`[JS Interceptor] Sending JSON string (length: ${jsonString.length}) back to Swift for ${url}`);
                                // 將 URL, Status, ContentType 和 JSON 字串發回 Swift
                                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[messageHandlerName]) {
                                    window.webkit.messageHandlers[messageHandlerName].postMessage({ 
                                        url: url, 
                                        status: status,
                                        contentType: contentType,
                                        jsonString: jsonString 
                                    });
                                }
                            }).catch(err => {
                                console.error(`[JS Interceptor] Error reading JSON body for ${url}:`, err);
                            });
                        }
                        // 返回原始回應，讓頁面繼續工作
                        return response;
                    })
                    .catch(error => {
                        console.error(`[JS Interceptor] Fetch error for ${url}:`, error);
                        throw error; // 重新拋出錯誤
                    });
            };
            console.log('[JS Interceptor] Global fetch interceptor installed.');
        })();
        """
        let userScript = WKUserScript(source: scriptSource, injectionTime: .atDocumentStart, forMainFrameOnly: false) // 監聽所有 frame
        userContentController.addUserScript(userScript)

        // 註冊 Message Handler
        userContentController.add(self, name: messageHandlerName)
        config.userContentController = userContentController

        // 初始化 WebView (不在視圖中顯示)
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        // 允許開發者工具 (如果需要除錯 JS)
        // config.preferences.setValue(true, forKey: "developerExtrasEnabled")
    }

    func startLoading(_ url: URL, completion: @escaping (Error?) -> Void) {
        guard !isLoading else {
            completion(NSError(domain: "MovieDataSniffer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Already loading."]))
            return
        }
        print("Starting to load URL: \(url)")
        isLoading = true
        loadCompletionHandler = completion
        let request = URLRequest(url: url)
        webView.load(request)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("Page finished loading: \(webView.url?.absoluteString ?? "unknown")")
        // 頁面主要 frame 載入完成，但不代表所有異步資源都結束
        // 可以在這裡設置一個計時器，如果在一段時間內沒有新的網路活動，就認為載入完成
        // 但為了簡單起見，我們依賴外部的 RunLoop 時間
        // isLoading = false // 不在這裡設置 false，因為異步請求可能仍在進行
        // loadCompletionHandler?(nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("Failed to load page: \(webView.url?.absoluteString ?? "unknown"), Error: \(error)")
        isLoading = false
        loadCompletionHandler?(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("Failed provisional navigation: \(error)")
        isLoading = false
        loadCompletionHandler?(error)
    }
    
    // (可選) 監聽資源載入，判斷網路是否空閒
    /*
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let response = navigationResponse.response as? HTTPURLResponse {
            print("[Resource Load] URL: \(response.url?.absoluteString ?? "?"), Status: \(response.statusCode)")
        }
        decisionHandler(.allow)
    }
    */

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
         // 確保在主線程處理
         guard Thread.isMainThread else {
              DispatchQueue.main.async { self.handleScriptMessage(message) }
              return
         }
         handleScriptMessage(message)
    }

    private func handleScriptMessage(_ message: WKScriptMessage) {
        print("--- Message Received from JS --- (", message.name, ")")
        guard message.name == messageHandlerName else { return }
        
        guard let bodyDict = message.body as? [String: Any], 
              let urlString = bodyDict["url"] as? String,
              let status = bodyDict["status"] as? Int,
              let contentType = bodyDict["contentType"] as? String,
              let jsonString = bodyDict["jsonString"] as? String 
        else {
            print("[!] Invalid message body format: \(message.body)")
            return
        }

        print("[*] JSON Response From: \(urlString) (Status: \(status))")
        print("    Content-Type: \(contentType)")

        // 進行關鍵字分析
        let lowerJsonString = jsonString.lowercased()
        let keywordsFound = keywords.filter { lowerJsonString.contains($0) }

        if keywordsFound.count >= keywordThreshold {
            print("    [*] Looks like relevant data! (Keywords found: \(keywordsFound.joined(separator: ", ")))")
            // 嘗試美化打印
            formatAndPrintJson(jsonString)
        } else {
            print("    [-] JSON content might not be movie schedule data. (Keywords found: \(keywordsFound.count)/\(keywords.count))")
            // 如果不相關，可以選擇不打印或只打印少量內容
            // formatAndPrintJson(jsonString, limitLines: 10) 
        }
        print("----------------------------------")
    }

    // 輔助函數：格式化並打印 JSON
    private func formatAndPrintJson(_ jsonString: String, limitLines: Int? = nil) {
        guard let jsonData = jsonString.data(using: .utf8) else {
            print("    [!] Could not convert JSON string to Data for formatting.")
            print("    --- Raw JSON String (Preview) ---")
            print(String(jsonString.prefix(500)) + (jsonString.count > 500 ? "..." : ""))
            print("    ---------------------------------")
            return
        }
        
        do {
            let jsonObject = try JSONSerialization.jsonObject(with: jsonData, options: [])
            let prettyJsonData = try JSONSerialization.data(withJSONObject: jsonObject, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
            if var prettyJsonString = String(data: prettyJsonData, encoding: .utf8) {
                print("    --- Formatted JSON Content ---")
                if let limit = limitLines {
                    let lines = prettyJsonString.split(separator: "\\n", omittingEmptySubsequences: false)
                    if lines.count > limit {
                         prettyJsonString = lines.prefix(limit).joined(separator: "\\n") + "\\n    ... (omitted \(lines.count - limit) lines)"
                    }
                }
                print(prettyJsonString)
                print("    ------------------------------")
            } else {
                print("    [!] Could not convert formatted data back to string. Printing raw preview.")
                print("    --- Raw JSON String (Preview) ---")
                print(String(jsonString.prefix(500)) + (jsonString.count > 500 ? "..." : ""))
                print("    ---------------------------------")
            }
        } catch {
            print("    [!] Failed to format JSON: \(error). Printing raw preview.")
            print("    --- Raw JSON String (Preview) ---")
            print(String(jsonString.prefix(500)) + (jsonString.count > 500 ? "..." : ""))
            print("    ---------------------------------")
        }
    }

    deinit {
         print("MovieDataSniffer deinit")
         // 移除 handler
         webView?.configuration.userContentController.removeScriptMessageHandler(forName: messageHandlerName)
    }
}

// --- 主執行流程 --- 

let sniffer = MovieDataSniffer()
guard let targetUrl = URL(string: "https://www.skcinemas.com/sessions?c=1004") else {
    fatalError("Invalid URL")
}

// 需要確保 App 在主線程運行以處理 WKWebView 事件
let app = NSApplication.shared // 獲取共享應用實例

class AppDelegate: NSObject, NSApplicationDelegate {
    let sniffer: MovieDataSniffer
    let targetUrl: URL
    
    init(sniffer: MovieDataSniffer, url: URL) {
        self.sniffer = sniffer
        self.targetUrl = url
        super.init()
    }
    
    func applicationDidFinishLaunching(_ aNotification: Notification) {
        print("NSApplication finished launching. Starting web view load.")
        sniffer.startLoading(targetUrl) { error in
            if let error = error {
                print("\nError during page load: \(error.localizedDescription)")
                // 即使載入失敗，RunLoop 可能仍在運行，需要手動停止
                // CFRunLoopStop(CFRunLoopGetCurrent())
                // NSApplication.shared.terminate(self)
            } else {
                print("\nPage load sequence initiated (check delegate methods for finish/fail).")
            }
            // 不在這裡終止，讓 RunLoop 繼續運行以接收異步 JS 訊息
        }
        
        // 設置一個計時器，在一段時間後停止 RunLoop
        // 這給予頁面足夠的時間來執行異步操作和 API 請求
        let runDuration: TimeInterval = 70 // 秒，可以根據需要調整
        print("Will stop RunLoop after \(runDuration) seconds.")
        Timer.scheduledTimer(withTimeInterval: runDuration, repeats: false) { _ in
            print("\nTimer fired. Stopping RunLoop.")
            CFRunLoopStop(CFRunLoopGetCurrent())
        }
    }
    
    // (可選) 處理應用退出
    func applicationWillTerminate(_ notification: Notification) {
        print("Application will terminate.")
    }
}

let delegate = AppDelegate(sniffer: sniffer, url: targetUrl)
app.delegate = delegate

print("Starting RunLoop...")
app.run() // 開始事件循環，會阻塞直到 CFRunLoopStop 被調用

print("RunLoop finished. Script exiting.")


