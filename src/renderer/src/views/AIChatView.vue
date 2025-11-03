<template>
  <div class="chat-view">
    <div class="chat-header">
      <router-link to="/" class="btn-back">返回</router-link>
      <div class="header-title">AI助手</div>
      <button class="btn-config">模型配置</button>
    </div>
    <div class="chat-messages">
      <div class="message-wrapper">
        <div class="message-bubble received">
          你好！有什么可以帮助你的吗？
        </div>
      </div>
      <div class="message-wrapper sent-wrapper">
        <div class="message-bubble sent">
          我想了解一下如何创建一个新的世界观。
        </div>
      </div>
    </div>
    <div class="chat-input-area">
      <textarea placeholder="输入你的问题..." class="chat-input"></textarea>
      <button class="btn-send">发送</button>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #ffffff;
}

.chat-header {
  padding: 10px 20px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  font-size: 16px;
  font-weight: 500;
}

.btn-back {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
  background-color: #fff;
  cursor: pointer;
  font-size: 14px;
  text-decoration: none;
  color: #333;
}

.btn-back:hover {
  background-color: #f5f5f5;
}

.btn-config {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
  background-color: #fff;
  cursor: pointer;
  font-size: 14px;
}

.btn-config:hover {
  background-color: #f5f5f5;
}

.chat-messages {
  flex-grow: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.message-wrapper {
  display: flex;
}

.sent-wrapper {
  justify-content: flex-end;
}

.message-bubble {
  max-width: 70%;
  padding: 10px 15px;
  border-radius: 18px;
  line-height: 1.5;
}

.received {
  background-color: #f0f2f5;
  color: #333;
  border-top-left-radius: 4px;
}

.sent {
  background-color: #007bff;
  color: white;
  border-top-right-radius: 4px;
}

.chat-input-area {
  display: flex;
  padding: 20px;
  border-top: 1px solid #e0e0e0;
  gap: 10px;
}

.chat-input {
  flex-grow: 1;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
  font-size: 14px;
  resize: none;
  height: 40px;
}

.btn-send {
  padding: 0 20px;
  border-radius: 4px;
  border: none;
  background-color: #007bff;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.btn-send:hover {
  background-color: #0056b3;
}
</style>