# 数学公式：LaTeX 原文 vs 模型转写的 MathML

下面每条公式左边是 Markdown 里常见的 LaTeX 写法（**以代码块原样保留**），右边是转成 MathML 后的实际排版效果。
如果两边语义一致，说明这条零依赖路径可用。

## 1. 简单分式与上标

LaTeX：`\frac{a+b}{2}` 与 `x^{2}`

转写后：<math display="inline"><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mn>2</mn></mfrac></math> 与 <math display="inline"><msup><mi>x</mi><mn>2</mn></msup></math>

## 2. 根号与不等式

LaTeX：`\sqrt{x^2+y^2} \le r`

转写后：<math display="inline"><msqrt><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><msup><mi>y</mi><mn>2</mn></msup></msqrt><mo>≤</mo><mi>r</mi></math>

## 3. 求和与下标

LaTeX：`\sum_{i=1}^{n} x_i`

转写后：<math display="inline"><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msub><mi>x</mi><mi>i</mi></msub></math>

## 4. 定积分

LaTeX：`\int_{0}^{1} f(x)\,dx`

转写后：<math display="inline"><msubsup><mo>∫</mo><mn>0</mn><mn>1</mn></msubsup><mi>f</mi><mo>(</mo><mi>x</mi><mo>)</mo><mi>d</mi><mi>x</mi></math>

## 5. 希腊字母与矩阵

LaTeX：`\alpha \beta \gamma \Delta`，以及 2×2 矩阵 `\begin{pmatrix} a & b \\ c & d \end{pmatrix}`

转写后：<math display="inline"><mi>α</mi><mo>,</mo><mi>β</mi><mo>,</mo><mi>γ</mi><mo>,</mo><mi>Δ</mi></math>

<math display="block"><mrow><mo>(</mo><mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr><mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr></mtable><mo>)</mo></mrow></math>

## 6. 带文字的公式与百分号

LaTeX：`\text{准确率} = \frac{\text{正确}}{\text{总数}} \times 100\%`

转写后：<math display="inline"><mtext>准确率</mtext><mo>=</mo><mfrac><mtext>正确</mtext><mtext>总数</mtext></mfrac><mo>×</mo><mn>100</mn><mo>%</mo></math>

## 7. 复杂一点：带上下限的连乘 + 括号

LaTeX：`\prod_{k=1}^{K} \left(1 - p_k\right)`

转写后：<math display="inline"><munderover><mo>∏</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>K</mi></munderover><mrow><mo>(</mo><mn>1</mn><mo>-</mo><msub><mi>p</mi><mi>k</mi></msub><mo>)</mo></mrow></math>

## 8. 代码块中的 LaTeX 必须保持字面

```latex
\frac{a+b}{2} \le \sqrt{x^2+y^2}
\sum_{i=1}^{n} x_i
```

上图这段不应被排版，应该原样显示反斜杠与花括号。
