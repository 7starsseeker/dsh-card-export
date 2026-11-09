# 公式版式修正与长嵌套试验

## A. 上下限位置：默认 vs displaystyle

默认（`display="inline"`，上下限在右侧）：

<math display="inline"><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msub><mi>x</mi><mi>i</mi></msub></math>

加 `displaystyle="true"`（上下限应堆叠到符号上下）：

<math display="inline" displaystyle="true"><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msub><mi>x</mi><mi>i</mi></msub></math>

块级 + displaystyle：

<math display="block" displaystyle="true"><munderover><mo>∏</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>K</mi></munderover><mo>(</mo><mn>1</mn><mo>-</mo><msub><mi>p</mi><mi>k</mi></msub><mo>)</mo></math>

## B. 括号伸缩：普通括号 vs stretchy

普通：

<math display="inline"><mo>(</mo><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mn>2</mn></mfrac><mo>)</mo></math>

`stretchy="true"`：

<math display="inline"><mo stretchy="true">(</mo><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mn>2</mn></mfrac><mo stretchy="true">)</mo></math>

矩阵括号用 stretchy：

<math display="block"><mrow><mo stretchy="true">[</mo><mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr><mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr></mtable><mo stretchy="true">]</mo></mrow></math>

## C. 长嵌套公式（考察转写是否会出错）

原始数学含义：K 分类的加权交叉熵

<math display="block" displaystyle="true"><mo>-</mo><munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>K</mi></munderover><msub><mi>w</mi><mi>k</mi></msub><mo>·</mo><mfrac><mn>1</mn><msub><mi>N</mi><mi>k</mi></msub></mfrac><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><msub><mi>N</mi><mi>k</mi></msub></munderover><msub><mi>y</mi><mrow><mi>i</mi><mi>k</mi></mrow></msub><mo>·</mo><mi>log</mi><mrow><mo stretchy="true">(</mo><mfrac><mrow><mi>exp</mi><mo>(</mo><msub><mi>z</mi><mrow><mi>i</mi><mi>k</mi></mrow></msub><mo>)</mo><mo>+</mo><mi>ε</mi></mrow><mrow><munder><mo>∑</mo><mrow><mi>j</mi><mo>=</mo><mn>1</mn></mrow></munder><mi>exp</mi><mo>(</mo><msub><mi>z</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>)</mo></mrow></mfrac><mo stretchy="true">)</mo></mrow></math>

再一个：嵌套根号与嵌套分式

<math display="block"><msqrt><mfrac><mrow><msqrt><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><msup><mi>y</mi><mn>2</mn></msup></msqrt></mrow><mrow><mn>1</mn><mo>+</mo><mfrac><mi>a</mi><mi>b</mi></mfrac></mrow></mfrac></msqrt></math>
