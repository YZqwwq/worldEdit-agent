# Home Canvas Elements

这个目录放世界观首页的 Canvas 定制元素。

- `types.ts`: 首页 Canvas 的共享类型。
- `theme.ts`: 首页自己的黑白主题调色板，不直接复用其他页面主题变量。
- `layout.ts`: 左侧装饰区与右侧工作区的比例定位。
- `drawingPrimitives.ts`: Canvas 基础绘图工具。
- `worldInstanceAnimation.ts`: 世界入口动画阶段时长，统一用毫秒调节。

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
- `fragmentShadowFade`: 保留给时间轴排布；当前碎片阴影会跟随 `fragmentGather` 位移同步淡出，聚合完成时阴影为 0。
- `cornerCut`: 完整矩形收进左下和右上两角，变成 6 边形的时间。
- `brighten`: 6 边形提高明度和不透明度的时间。
- `dotFade`: 点阵图淡入时间。
- `lineFade`: 平面线条淡入时间。
- `textFade`: 世界名称和摘要淡入时间。
- `enterFade`: “进入”文字、下划线、箭头淡入时间。
- `WORLD_INSTANCE_EXIT_ANIMATION_MS.contentFade`: hover 退出时，6 边形内部内容统一淡出时间，包含明度、点阵、线条、文字和“进入”入口。
- `WORLD_INSTANCE_EXIT_ANIMATION_MS.cornerCut`: hover 退出时，6 边形还原为完整矩形的时间。
- `WORLD_INSTANCE_EXIT_ANIMATION_MS.fragmentShadowFade`: hover 退出时，碎片阴影恢复时间。
- `WORLD_INSTANCE_EXIT_ANIMATION_MS.fragmentGather`: hover 退出时，完整矩形重新离散的时间。
