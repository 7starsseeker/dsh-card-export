/**
 * skin-report — 报告类文档共用的视觉层（C 皮肤：冷白 + 单一蓝）。
 *
 * 为什么单独抽出来：事实核查报告与普通报告是同一类东西（文档），
 * 应该共用一套版式；差别只在"有没有结论区"，不该变成两套皮。
 * 对话类内容走另一套（transcript 皮肤）。
 *
 * 判定语义色见 verdict.mjs 的 TIERS；这里只管版式与容器。
 */

export const REPORT_CSS = `
*{box-sizing:border-box}
body{margin:0;padding:26px 0 40px;background:#EDEEF0;color:#0A0A0A;
  font-family:"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif}
.card{width:900px;margin:0 auto;overflow:hidden;background:#FAFAF8;padding:0 60px 40px}
.band{background:#1F3A8A;height:6px;margin:0 -60px 26px}
.kicker{font-size:11px;letter-spacing:5px;font-weight:800;color:#1F3A8A;margin-bottom:14px}
h1{font-size:28px;line-height:1.4;margin:0 0 12px;font-weight:800;letter-spacing:-.3px}
h1.d{font-size:22px;margin:0 0 10px}
.dek{font-size:15px;line-height:1.8;color:#3A3F46;margin:0 0 16px;font-weight:500}
h1.d + .dek{font-size:13.5px;font-weight:500;margin-top:-4px}
.meta,.dmeta{color:#6A6F76;padding-bottom:16px;border-bottom:2px solid #0A0A0A;font-size:11.5px;line-height:1.7}
.verdict{display:flex;gap:26px;align-items:flex-start;padding:24px 0 22px}
.vbadge{flex:none;padding:16px 8px 14px;width:120px;text-align:center}
.vi{display:block;font-size:26px;font-weight:800;line-height:1}
.vt{display:block;font-size:18px;letter-spacing:3px;margin-top:8px;font-weight:800}
.vc{display:block;font-size:11px;margin-top:9px;border-top:1px solid rgba(255,255,255,.35);padding-top:8px}
.vbody{flex:1;min-width:0}
.rails{display:flex;gap:14px;margin-bottom:13px}
.rails.col{flex-direction:column;gap:8px}
.rails.col .rail{margin:0}
.rails.wide{margin-bottom:14px}
.rail{flex:1;background:#F2F4F7;border-left:3px solid #1F3A8A;padding:9px 12px;font-size:12.5px;line-height:1.6}
.rail b{display:block;font-size:10.5px;letter-spacing:1.5px;color:#1F3A8A;margin-bottom:3px}
.judge{font-size:14.5px;line-height:1.85}
.takeaway{background:#F2F4F7;border-left:4px solid #1F3A8A;padding:14px 18px;margin:2px 0 26px;
  font-size:14.5px;line-height:1.9}
.takeaway.inline{margin:0}
.takeaway b{display:block;font-size:10.5px;letter-spacing:2px;color:#1F3A8A;margin-bottom:6px}
.sec{margin-top:30px}
.sec h2{display:flex;gap:10px;align-items:baseline;font-weight:800;font-size:14px;letter-spacing:1.5px;
  margin:0 0 14px;padding-left:12px;border-left:5px solid #1F3A8A}
.sec h2 i{font-style:normal;font-size:11px;color:#1F3A8A;letter-spacing:1px;font-weight:800}
.prose p{font-size:14px;line-height:1.95;margin:0 0 11px}
.prose strong{font-weight:800}
.fact{background:#FFFFFF;border:1px solid #DDE0E4;padding:13px 16px;margin-bottom:11px}
.fact.ban{background:#F2F4F7}
.fhead{display:flex;align-items:baseline;gap:9px}
.tag{font-size:11.5px;font-weight:800;letter-spacing:1px;color:#FAFAF8;padding:2px 9px}
.sub{font-size:11.5px;color:#6A6F76}
.ft{font-size:14px;line-height:1.75;margin-top:7px}
.warn{font-size:11.5px;margin-top:7px;color:#A63228;font-weight:600}
sup{font-size:9.5px;font-weight:800;margin-left:1px;color:#1F3A8A}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:9px 10px 9px 0;vertical-align:top;line-height:1.65}
tr+tr td{border-top:1px solid #DDE0E4}
.plain tr:first-child td{border-top:none}
th{text-align:left;font-size:11.5px;letter-spacing:1px;color:#6A6F76;font-weight:800;
  padding:6px 10px 6px 0;border-bottom:2px solid #0A0A0A}
.vk{width:96px;white-space:nowrap;color:#6A6F76}
.rail-tbl td{font-size:12px}
.rail-tbl tr:first-child td{font-size:10.5px;letter-spacing:1.2px;color:#6A6F76;padding-bottom:6px}
.lv{width:46px;font-weight:800;color:#1F3A8A}
.si{width:190px;font-weight:700}
.src-tbl .si{width:44px;color:#1F3A8A;font-weight:800}
.st{display:block;font-size:11.5px;color:#6A6F76}
.note{font-size:12.5px;line-height:1.85;margin-top:10px;padding-left:2px}
.note b{color:#1F3A8A}
.note.dim{color:#6A6F76}
.ul,.ol{margin:0 0 12px;padding-left:20px;font-size:13.5px;line-height:1.9}
.nav{list-style:none;margin:0 0 12px;padding-left:0;font-size:13.5px;line-height:1.95}
.nav li{padding-left:14px;position:relative}
.nav li::before{content:'';position:absolute;left:0;top:11px;width:5px;height:1px;background:#1F3A8A}
.nav li.dim{color:#6A6F76}
.nav li.dim::before{background:#6A6F76}
.points{margin:0 0 12px;padding-left:24px;font-size:14px;line-height:1.95}
.points li{margin-bottom:7px}
.points li::marker{color:#1F3A8A;font-weight:800}
.nums{display:flex;flex-wrap:wrap;gap:10px}
.num{flex:1 1 30%;min-width:180px;background:#FFFFFF;border:1px solid #DDE0E4;
  border-left:4px solid #1F3A8A;padding:11px 14px}
.nv{display:block;font-size:19px;font-weight:800;color:#0A0A0A;letter-spacing:-.2px;line-height:1.3}
.nl{display:block;font-size:11.5px;color:#6A6F76;margin-top:5px;line-height:1.5}
.doc h2{font-size:15px;letter-spacing:1px;font-weight:800;margin:28px 0 12px;padding-left:12px;
  border-left:5px solid #1F3A8A}
.doc h3{font-size:14px;font-weight:800;margin:20px 0 10px}
.doc p{font-size:14px;line-height:1.95;margin:0 0 11px}
.doc ul,.doc ol{margin:0 0 12px;padding-left:22px;font-size:14px;line-height:1.9}
.doc blockquote{margin:0 0 12px;padding:8px 14px;background:#F2F4F7;border-left:3px solid #1F3A8A;
  font-size:13.5px;color:#3A3F46}
.doc code{background:#F2F4F7;border:1px solid #DDE0E4;border-radius:4px;padding:1px 5px;font-size:12.5px}
.doc pre{background:#F2F4F7;border:1px solid #DDE0E4;border-radius:8px;padding:12px 14px;margin:0 0 12px;overflow:hidden}
.doc pre code{background:none;border:none;padding:0;font-size:12px;line-height:1.7}
/* 前置块（定型卡 / 改型声明）与正文里的围栏代码：不写样式就用浏览器默认等宽，
   长行会被卡片宽度直接裁掉——换成 pre-wrap 让它在框内折行。 */
.pre{background:#F2F4F7;border-left:4px solid #1F3A8A;padding:11px 14px;margin:0 0 6px}
.pre b{display:block;font-size:10.5px;letter-spacing:2px;color:#1F3A8A;margin-bottom:6px}
.md pre{background:#F2F4F7;border:1px solid #DDE0E4;border-radius:6px;padding:10px 12px;margin:0 0 12px;
  font-size:12px;line-height:1.7;white-space:pre-wrap;word-break:break-word;overflow:hidden}
.md pre code{background:none;border:none;padding:0;font-size:12px}
.pre .md pre{margin:0;background:none;border:none;padding:0}
.doc hr{border:none;border-top:1px solid #DDE0E4;margin:20px 0}
.doc a{color:#1F3A8A}
.foot{margin-top:30px;padding-top:14px;border-top:2px solid #0A0A0A;color:#6A6F76;font-size:11px;line-height:1.8}
.dchip{display:inline-block;color:#FAFAF8;font-size:11px;font-weight:800;padding:1px 8px;margin-right:9px;letter-spacing:1px}
.missing{margin-top:14px;font-size:11.5px;color:#A63228}
/* 脚注、图片引用、HTML 直通的最小样式 */
.fnref a{color:#1F3A8A;text-decoration:none;font-size:11px}
.footnotes{margin-top:22px;padding-top:14px;border-top:1px solid #DDE0E4;font-size:12px;line-height:1.8;color:#3A3F46}
.footnotes .fn-title{font-size:11px;letter-spacing:2px;font-weight:800;color:#6A6F76;margin-bottom:8px}
.footnotes .fn{margin:0 0 6px}
.footnotes .fn-id{color:#1F3A8A;font-weight:800;margin-right:4px}
.imgref{display:inline-block;font-size:11px;color:#6A6F76;background:#F2F4F7;
  border:1px dashed #C9CDD4;border-radius:4px;padding:0 6px}
#end{height:0}
/* 分隔线：既是正常的分节符，也是一条笔直的裁切参考线。
   通栏（延伸到卡片左右边缘）——切开时线到边，不会切歪；视觉上就是一条细分割线。 */
.cut{height:1px;background:#E2E5E9;margin:38px -60px 16px}
/* 分页页：去掉底部装饰性留白，让"内容结束"就是"画面结束"（不靠事后裁像素） */
html.paged body{padding-bottom:0}
html.paged .card{padding-bottom:0}
html.paged .foot{margin-bottom:0}
`

/** 整页 HTML 外壳（含高度自报脚本，栅格化依赖它量高）。
 *  高度用**末尾哨兵** `#end` 的位置：卡片底边/scrollHeight 都会比实际绘制位置大出
 *  几十到几百像素（浏览器几何与绘制的偏差），哨兵是内容真正结束的地方。
 *  分页页加 `.paged`，去掉底部装饰性内边距，使"内容结束"就是"画面结束"。 */
export function page(inner, { title = '报告', paged = false } = {}) {
  return `<!DOCTYPE html><html lang="zh-CN"${paged ? ' class="paged"' : ''}><head><meta charset="utf-8"><title>${String(title)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>
<style>${REPORT_CSS}</style></head><body><div class="card">${inner}<div id="end"></div></div>
<script>window.addEventListener('load',function(){
  var c=document.querySelector('.card');
  var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);
  var e=document.querySelector('.foot');
  var hb=Math.ceil(e.getBoundingClientRect().bottom+window.scrollY)+2;
  document.documentElement.setAttribute('data-hb',hb);document.documentElement.setAttribute('data-h',h);document.title='H='+h;
  var els=[].slice.call(document.querySelectorAll('[data-split]'));
  var arr=els.map(function(e){var r=e.getBoundingClientRect();
    return [Math.round(r.top+window.scrollY),Math.round(r.height)];});
  var s=document.createElement('script');s.type='application/json';s.id='dsplit';
  s.textContent=JSON.stringify({h:h,blocks:arr});document.body.appendChild(s);});</script>
</body></html>`
}
