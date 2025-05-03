<script setup lang="ts">
import { ElIcon } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'

defineProps<{
  loading: boolean
  loadingMessage: string
}>()
</script>

<template>
  <div v-if="loading" class="custom-loading-overlay">
    <el-icon class="is-loading custom-loading-spinner" :size="30">
      <Loading />
    </el-icon>
    <p class="custom-loading-text">{{ loadingMessage }}</p>
  </div>
</template>

<style scoped>
/* Loading Overlay Styles */
.custom-loading-overlay {
  position: fixed; /* Use fixed to cover the whole viewport */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(20, 20, 20, 0.8); /* Dark semi-transparent */
  backdrop-filter: blur(5px); /* Blur effect */
  z-index: 2000; /* Ensure it's on top */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #FFFFFF; 
}

.custom-loading-spinner {
  /* Spinner color inherits from parent */
}

.custom-loading-text {
  margin-top: 15px;
  color: #C0C4CC; 
  font-size: 0.9rem; 
}
</style> 