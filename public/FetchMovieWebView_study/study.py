import json  # 導入處理 JSON 數據的函式庫
from playwright.sync_api import sync_playwright  # 從 playwright 函式庫導入同步 API

TARGET_URL = "https://www.skcinemas.com/sessions?c=1004"  # 設定目標網站的 URL
# TARGET_API_FRAGMENT = "/api/VistaDataV2/GetSessionByCinemasIDForApp" # Removed specific target
found_api = False  # 初始化一個布林變數，用來標記是否找到目標 API

def handle_response(response):  # 定義一個處理網路回應的函數
    global found_api  # 聲明將使用全域變數 found_api
    content_type = response.headers.get("content-type", "").lower()  # 獲取回應標頭中的 content-type，並轉換為小寫
    # if TARGET_API_FRAGMENT in response.url: # Removed specific target check
    #     print(f"[+] Response received from TARGET API: {response.url}")
    #     print(f"    Response Status: {response.status}")
        
    # Focus on JSON responses  # 註釋：專注於 JSON 回應
    if "application/json" in content_type or "text/json" in content_type:  # 檢查 content-type 是否包含 JSON 相關字串
        # if TARGET_API_FRAGMENT not in response.url: # Removed specific target check
        print(f"[*] JSON Response from: {response.url} (Status: {response.status})") # Added status
        print(f"    Content-Type: {content_type}")
        try:  # 開始錯誤處理區塊
            body = response.json() # Playwright automatically parses JSON  # 嘗試將回應內容解析為 JSON (Playwright 會自動解析)
            print("    Successfully parsed JSON.")  # 打印成功解析 JSON 的訊息
            
            # --- Heuristics to check if it looks like movie data ---   # 註釋：檢查是否像電影數據的啟發式方法
            body_str_lower = json.dumps(body).lower() # Check against string representation # 將 JSON 物件轉換為小寫字串表示形式
            keywords = ["movie", "session", "showtime", "date", "theater", "film", "rating"]  # 定義與電影數據相關的關鍵字列表
            keywords_found = [kw for kw in keywords if kw in body_str_lower]  # 找出 JSON 字串中包含的關鍵字
            
            if len(keywords_found) >= 3: # Adjust threshold if needed # 如果找到的關鍵字數量達到 3 個或更多 (閾值可調整)
                print(f"    [*] Looks like relevant data! (Keywords found: {keywords_found})")  # 打印看起來是相關數據的訊息，並顯示找到的關鍵字
                # if TARGET_API_FRAGMENT in response.url or len(json.dumps(body)) < 2000: # Removed specific target check
                print("    --- JSON Content ---")
                print(json.dumps(body, indent=2, ensure_ascii=False))
                print("    --------------------");
                # else:
                #     print("    (JSON content is long, omitting full print for brevity)")
                found_api = True # Mark that we found something promising # 將 found_api 標記為 True，表示找到了有潛力的 API
            else:  # 否則 (找到的關鍵字少於 3 個)
                print("    [-] JSON content might not be the movie schedule data.")  # 打印 JSON 內容可能不是電影時刻表的訊息
                
        except Exception as e:  # 如果解析 JSON 時發生錯誤
            print(f"    [!] Error parsing JSON body: {e}")  # 打印解析 JSON 錯誤的訊息
        print("-" * 20)  # 打印分隔線

# Function to handle requests and print details
def handle_request(request):
    # if TARGET_API_FRAGMENT in request.url: # Removed specific target check
    print(f"\n[+] Request Intercepted: {request.url}") # Print for all requests
    print(f"    Request Method: {request.method}")
    print("    Request Headers:")
    # Limit printing headers for brevity unless it's a POST
    headers_to_print = request.headers
    if request.method != "POST" and len(headers_to_print) > 8: 
         print("        (Headers omitted for non-POST request brevity...)")
    else:
        for key, value in headers_to_print.items():
            print(f"        {key}: {value}")
    
    post_data = request.post_data
    if post_data:
        try:
            post_data_json = request.post_data_json
            print("    Request Body (JSON):")
            print(json.dumps(post_data_json, indent=2, ensure_ascii=False))
        except Exception:
            try:
                post_data_text = post_data
                if isinstance(post_data, bytes):
                     post_data_text = post_data.decode('utf-8', errors='ignore')
                # Only print body if not excessively long
                if len(post_data_text) < 1000:
                    print("    Request Body (Raw Text):")
                    print(post_data_text)
                else:
                    print("    Request Body (Raw Text, Too Long, Omitted)")
            except Exception as decode_err:
                 print(f"    [!] Could not decode request body: {decode_err}")
    # else: # Don't print 'None' for every GET request
    #     print("    Request Body: None")
    print("-" * 20) # Separator for requests

print(f"Starting Playwright analysis for: {TARGET_URL}")
# print(f"Looking for requests/responses related to: {TARGET_API_FRAGMENT}") # Removed specific target message
print("Intercepting all requests and looking for JSON responses containing movie data...")

with sync_playwright() as p:  # 使用 sync_playwright 的上下文管理器
    try:  # 開始錯誤處理區塊
        browser = p.chromium.launch(headless=True) # Use headless mode # 啟動 Chromium 瀏覽器 (使用無頭模式)
        page = browser.new_page()  # 開啟一個新的瀏覽器頁面
        
        # Register BOTH request and response handlers
        page.on("request", handle_request)
        page.on("response", handle_response)
        
        print(f"Navigating to {TARGET_URL}...")  # 打印正在導航至目標 URL 的訊息
        page.goto(TARGET_URL, wait_until="networkidle", timeout=60000) # Wait for network to be idle, timeout 60s # 導航至目標 URL，等待網路空閒狀態 (超時 60 秒)
        
        print("Navigation and network idle state reached.")  # 打印已達到導航和網路空閒狀態的訊息
        # Give a little extra time just in case  # 註釋：為了保險起見，多給一點時間
        page.wait_for_timeout(3000) # 等待 3000 毫秒 (3 秒)
        
        browser.close()  # 關閉瀏覽器
        print("Browser closed.")  # 打印瀏覽器已關閉的訊息
        
    except Exception as e:  # 如果 Playwright 執行過程中發生錯誤
        print(f"\n[!] An error occurred during Playwright execution: {e}")  # 打印 Playwright 執行錯誤的訊息

# Final Summary  # 註釋：最終總結
print("=" * 30)  # 打印分隔線
if found_api:  # 如果 found_api 為 True (即找到了潛在的 API)
    print("[*] Analysis complete. Potential JSON API(s) for movie data were found.")
    # print(f"    Please review the details for the target API: {TARGET_API_FRAGMENT} above.") # Removed specific target message
else:  # 否則 (沒有找到明顯的 API)
    print("[*] Analysis complete. No obvious JSON API for movie schedule data was detected.")
print("=" * 30) # 打印分隔線 