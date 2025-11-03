<template>
  <div class="home-view">
    <div class="main-content">
      <div class="header">
        <input type="text" placeholder="搜索" class="search-bar" />
      </div>
      <div class="world-view-section">
        <div class="section-header">
          <h2>我的世界观</h2>
          <button class="btn">新建世界观</button>
        </div>
        <div class="world-view-grid">
          <div class="world-view-card">世界观一</div>
          <div class="world-view-card">世界观二</div>
          <div class="world-view-card"></div>
          <div class="world-view-card"></div>
        </div>
      </div>
    </div>
    <div class="sidebar">
      <button class="btn sidebar-btn">导入世界观</button>
      <button class="btn sidebar-btn">导出世界观</button>
      <router-link to="/chat" class="btn sidebar-btn">AI助手</router-link>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.home-view {
  display: flex;
  height: 100vh;
  background-color: #f0f2f5;
}

.main-content {
  flex-grow: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.header {
  margin-bottom: 20px;
}

.search-bar {
  width: 100%;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
  font-size: 14px;
}

.world-view-section {
  flex-grow: 1;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 1px solid #d9d9d9;
  padding-bottom: 10px;
}

.section-header h2 {
  font-size: 16px;
  font-weight: 500;
  margin: 0;
}

.world-view-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 20px;
}

.world-view-card {
  height: 120px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fff;
  cursor: pointer;
  transition: box-shadow 0.3s;
}

.world-view-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.sidebar {
  width: 200px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  border-left: 1px solid #d9d9d9;
  background-color: #fff;
}

.btn {
  padding: 10px 15px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
  background-color: #fff;
  cursor: pointer;
  text-align: center;
  font-size: 14px;
}

.btn:hover {
  background-color: #f5f5f5;
}

.sidebar-btn {
  width: 100%;
  text-decoration: none;
  color: inherit;
  box-sizing: border-box;
}
</style>