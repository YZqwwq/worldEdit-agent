<script setup lang="ts">
// 全局应用配置
</script>

<template>
  <div id="app">
    <!-- 路由视图 -->
    <router-view />
  </div>
</template>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #f8f9fa;
  color: #212529;
}

#app {
  height: 100vh;
  width: 100vw;
  position: relative;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 通用按钮样式 */
button {
  font-family: inherit;
  cursor: pointer;
  outline: none;
}

/* 通用输入框样式 */
input, textarea {
  font-family: inherit;
  outline: none;
}

/* 链接样式 */
a {
  color: inherit;
  text-decoration: none;
}

/* 列表样式 */
ul, ol {
  list-style: none;
}

/* 图片样式 */
img {
  max-width: 100%;
  height: auto;
}

/* 选择文本样式 */
::selection {
  background-color: #007bff;
  color: white;
}

::-moz-selection {
  background-color: #007bff;
  color: white;
}
</style>
