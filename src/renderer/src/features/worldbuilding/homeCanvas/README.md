# Home Canvas Elements

这个目录放世界观首页的 Canvas 定制元素。

- `types.ts`: 首页 Canvas 的共享类型。
- `theme.ts`: 首页自己的黑白主题调色板，不直接复用其他页面主题变量。
- `layout.ts`: 左侧装饰区与右侧工作区的比例定位。
- `drawingPrimitives.ts`: Canvas 基础绘图工具。
- `createButton.ts`: 首页创建按钮配置和绘制，包含四层同心圆、顶点圆点和顶点连线。
- `worldInstanceAnimation.ts`: 世界入口动画阶段时长，统一用毫秒调节。
- `worldInstanceSecondLayer.ts`: 世界入口聚合后的第二层绘制参数，包含世界名称、Enter、点阵、圆弧、直线等位置。

后续左侧装饰、中间世界入口、创建按钮等元素会继续拆到这里。

## 世界入口切片调节

世界入口的离散动画由每个切片的 `x / y / w / h / dx / dy` 控制。

- `x / y / w / h` 是切片在最终完整矩形里的比例坐标，取值一般在 `0 ~ 1`。所有切片加起来必须完整覆盖最终矩形，否则拼合后会出现白色空洞。
- `dx / dy` 是离散状态下相对最终位置的像素位移。`dx < 0` 向左，`dx > 0` 向右，`dy < 0` 向上，`dy > 0` 向下。
- 想让离散效果更收束，就按比例同时缩小所有 `dx / dy`。例如乘以 `0.6` 会明显靠近最终矩形。
- 想让某块成为视觉牵引点，只调大那一块的 `dx / dy`。四角块通常可以比中心块动得更明显。
- 想做局部堆叠，不改切片形状，改位移即可。让两个切片的分散目标区域相互覆盖或贴近，它们就会在视觉上形成错层。
- 中心块建议少动，边角块建议多动。这样整体不会变成平均散开的矩形阵列。
- 调整切片比例时，先保证最终状态无缝覆盖，再调整位移。优先修 `w / h` 覆盖，再调 `dx / dy` 动势。

当前首页里中间世界入口使用了独立切片表，左右入口使用更规整的切片表。后续如果继续细分，建议把这些切片表拆成单独元素文件。

## 世界入口动画调节

动画阶段集中在 `worldInstanceAnimation.ts`。

- `WORLD_INSTANCE_ENTER_TOTAL_MS`: 自动计算出的单次 hover 进入动画总时长，不需要手写维护。
- `fragmentGather`: 离散矩形聚合为完整矩形的时间。
- `cornerCut`: 完整矩形收进左下和右上两角，变成 6 边形的时间。
- `brighten`: 6 边形提高明度和不透明度的时间。
- `dotFade`: 点阵图淡入时间。
- `lineFade`: 平面线条淡入时间。
- `textFade`: 世界名称和摘要淡入时间。
- `enterFade`: “进入”文字、下划线、箭头淡入时间。
- `WORLD_INSTANCE_EXIT_ANIMATION_MS.contentFade`: hover 退出时，6 边形内部内容统一淡出时间，包含明度、点阵、线条、文字和“进入”入口。
- `WORLD_INSTANCE_EXIT_ANIMATION_MS.cornerCut`: hover 退出时，6 边形还原为完整矩形的时间。
- `WORLD_INSTANCE_EXIT_ANIMATION_MS.fragmentGather`: hover 退出时，完整矩形重新离散的时间。

## 世界入口第二层调节

第二层统一在 `worldInstanceSecondLayer.ts` 里调，不建议直接在 `WorldEditHomeView.vue` 里改坐标。

- 移动世界名称：改 `WORLD_INSTANCE_SECOND_LAYER.content.titleY`。数值越小越靠上，越大越靠下。
- 移动世界摘要：改 `WORLD_INSTANCE_SECOND_LAYER.content.summaryY`。
- 左右移动文字组：改 `WORLD_INSTANCE_SECOND_LAYER.content.x`。
- 调整文字区域宽度：改 `WORLD_INSTANCE_SECOND_LAYER.content.width`。
- 移动 Enter：改 `WORLD_INSTANCE_SECOND_LAYER.enter.y`。
- 调整 Enter 下划线长度：改 `WORLD_INSTANCE_SECOND_LAYER.enter.underlineWidth`。
- 调整箭头高度：改 `WORLD_INSTANCE_SECOND_LAYER.enter.arrowYOffset`。
- 调整箭头长度：改 `WORLD_INSTANCE_SECOND_LAYER.enter.arrowLength`。
- 新增点阵图：往 `WORLD_INSTANCE_SECOND_LAYER.dotGroups` 数组里追加一个点阵对象。
- 移动点阵图：改对应点阵对象的 `x` 和 `y`。
- 调整点阵密度：改对应点阵对象的 `rows`、`cols`、`gapRatio`。`gapRatio` 会乘以六边形短边，适合不同设备等比例缩放。
- 调整点大小和深浅：改对应点阵对象的 `sizeRatio`、`alpha`。`sizeRatio` 会乘以六边形短边。
- 调整点阵扩散节奏：改对应点阵对象的 `spreadDistance` 和 `spreadSoftness`。
- 移动圆弧：改 `WORLD_INSTANCE_SECOND_LAYER.line.arcs` 内每条圆弧的 `cx` / `cy`。
- 调整圆弧大小：改 `arcs[].radius`。
- 调整圆弧绘制长度：改 `arcs[].sweep`。
- 新增/移动直线：改 `WORLD_INSTANCE_SECOND_LAYER.line.diagonals`。每条线都有 `startX / startY / endX / endY / lineWidth / alpha`。
- 调整小方块明度：改 `WORLD_INSTANCE_SECOND_LAYER.line.blocks` 里单个 block 的 `alpha`。
- 调整左侧装饰区域宽度：改 `WORLD_INSTANCE_SECOND_LAYER.line.areaWidth`。
- 移动右侧竖点列：改 `WORLD_INSTANCE_SECOND_LAYER.sideDots.xFromRight` 和 `sideDots.y`。

这些值大多是比例坐标。例如 `0.31` 表示当前六边形高度的 31% 位置，`0.52` 表示宽度的 52% 位置。

## 创建按钮调节

创建按钮统一在 `createButton.ts` 里调。

- 调整同心圆数量：改 `HOME_CREATE_BUTTON.rings` 数组。
- 调整圆之间的 gap：改每个 ring 的 `radiusRatio`。外层和内层半径比例差越大，gap 越大。
- 调整线条粗细：改 ring 的 `lineWidth`。最外层可以设置更细，例如 `0.6`。
- 调整圆环深浅：改 ring 的 `alpha`。
- 是否显示某个顶点圆点：改对应 ring 的 `points[].visible`。
- 顶点位置：改 `points[].angle`，角度单位是度，`0` 在右侧，`90` 在下方。
- 顶点圆点大小：改 `points[].sizeRatio`。
- 顶点圆点明度：改 `points[].lightness`，`0` 是黑，`255` 是白。
- 顶点圆点透明度：改 `points[].alpha`。
- 是否连接不同圆环之间的同角度顶点：改 `vertexConnections.enabled`。
- 参与连线的角度：改 `vertexConnections.angles`。
- 顶点连线粗细和深浅：改 `vertexConnections.connectLineWidth`、`vertexConnections.connectAlpha`。
- 中心十字大小和粗细：改 `cross.sizeRatio`、`cross.lineWidth`。

## AI 图标调节

右上角 AI 图标统一在 `assistantButton.ts` 里调。

- 调整图标尺寸：改 `HOME_ASSISTANT_BUTTON.size`。
- 调整同心圆基础大小：改 `rings[].radiusRatio`。
- 调整 hover 后同心圆放大幅度：改 `rings[].hoverRadiusRatio`。
- 调整同心圆线条粗细和透明度：改 `rings[].lineWidth`、`rings[].alpha`。
- 调整 hover 呼吸幅度：改 `hover.pulseRadiusRatio`。
- 调整 hover 呼吸速度：改 `hover.pulseSpeed`。
- 调整 hover 进入/退出速度：改 `hover.progressSpeed`。
- 调整中心底色大小和透明度：改 `hover.panelRadiusRatio`、`hover.panelAlpha`。

## 右上竖线条调节

右上角竖线条统一在 `topBars.ts` 里调。

- 调整线条数量：改 `HOME_TOP_BARS.count`。
- 调整位置：改 `xRatio` 和 `y`。
- 调整普通间距和 hover 间距：改 `baseGap`、`hoverGap`。hover 只改变左右间距。
- 调整普通高度：改 `baseHeight`。
- 调整点击后从中心向两侧扩散的波浪：改 `waveDuration`、`waveExtraHeight`、`waveJumpOffset`、`waveSpreadDelay`、`wavePulseWidth`。
- 调整点击/hover 热区：改 `hitPaddingX`、`hitPaddingY`。
