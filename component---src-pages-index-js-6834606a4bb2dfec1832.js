"use strict";(self.webpackChunkblog=self.webpackChunkblog||[]).push([[678],{8771:function(e,t,a){var i=a(7294),r=a(1597),n=a(396);t.Z=function(){var e,t,l=(0,r.useStaticQuery)("3257411868"),o=null===(e=l.site.siteMetadata)||void 0===e?void 0:e.author,c=null===(t=l.site.siteMetadata)||void 0===t?void 0:t.social,s=i.useState(null),u=s[0],f=s[1];return i.useEffect((function(){f(window.__theme),window.__onThemeChange2=function(){f(window.__theme)}}),[]),i.createElement(i.Fragment,null,i.createElement("div",{className:"bio"},i.createElement(n.S,{className:"bio-avatar",layout:"fixed",formats:["auto","webp","avif"],src:"../images/profile-pic.png",width:50,height:50,quality:95,alt:"Profile picture",__imageData:a(1550)}),(null==o?void 0:o.name)&&i.createElement("p",null,"technical blog by"," ",i.createElement("a",{href:"https://twitter.com/"+((null==c?void 0:c.twitter)||"")},i.createElement("strong",null,o.name)),i.createElement("br",null),(null==o?void 0:o.summary)||null)),i.createElement("div",{style:{display:"flex",flexDirection:"row",gap:"1rem"}},i.createElement("a",{href:"https://github.com/murugu-21",alt:"link to author's github profile"},"light"===u?i.createElement(n.S,{layout:"fixed",formats:["auto","webp","avif"],src:"../images/Github-dark.png",width:32,height:32,quality:95,alt:"Github profile link dark",__imageData:a(417)}):i.createElement(n.S,{layout:"fixed",formats:["auto","webp","avif"],src:"../images/Github-light.png",width:32,height:32,quality:95,alt:"Github profile link light",__imageData:a(5753)})),i.createElement("a",{href:"https://stackoverflow.com/users/15790108/murugappan-m",alt:"link to author's stackoverflow profile"},i.createElement(n.S,{layout:"fixed",formats:["auto","webp","avif"],src:"../images/stack-overflow.png",width:32,height:32,quality:95,alt:"stackoverflow profile link",__imageData:a(4242)}))))}},7361:function(e,t,a){a.r(t),a.d(t,{default:function(){return S}});var i=a(7294),r=a(8771),n=a(3508),l=a(262),o=a(5785),c={width:"100%",padding:".25em .5em",fontSize:"1.25rem",borderRadius:"0.5rem",border:"0.1rem solid var(--color-primary)",backgroundColor:"var(--color-background)",color:"var(--color-text)"},s=function(e){var t=e.query,a=e.onChange;return i.createElement("input",{id:"search",type:"search","aria-label":"search article by tag or title",className:"search",style:c,value:t,onInput:a})},u=i.memo(s),f={display:"flex",alignItems:"center",borderRadius:".25em",marginRight:".75em"},d={padding:"0 .5em",borderRight:"none",border:"1px solid var(--color-text)"},m={display:"flex",alignItems:"center",fontSize:".8em",backgroundColor:"var(--color-accent)",color:"white",borderRadius:"0 .25em .25em 0",padding:"0 .5em",alignSelf:"stretch"},p={opacity:0,position:"absolute",left:"-99999px"},g=function(e){var t=e.tag,a=e.onTagSelect,r=e.isSelected,n=e.marginTop,l=void 0===n?".875em":n;return i.createElement(i.Fragment,null,a&&i.createElement("input",{style:p,type:"checkbox",checked:r,onChange:a,className:a&&"tag",id:"tag-"+t.name,value:t.name}),i.createElement("label",{htmlFor:a&&"tag-"+t.name,style:Object.assign({},f,{marginTop:l})},i.createElement("span",{style:Object.assign({},d,{borderRadius:null!=t.count?".25em 0 0 .25em":".25em"})},t.name),t.count&&i.createElement("div",{style:m},t.count)))},b=i.memo(g),h={display:"flex",flexWrap:"wrap"},v=function(e){var t=e.tags,a=e.onTagSelect,r=e.selectedTags,n=e.marginTop;return i.createElement("div",{style:h},t.map((function(e){return i.createElement(b,{marginTop:n,key:e.name,tag:e,onTagSelect:a,isSelected:r.includes(e.name)})})))},w=a(1597),y=a(5868),k=function(e){var t=e.post,a=t.frontmatter.title||t.fields.slug;return i.createElement("li",null,i.createElement("article",{className:"post-list-item",itemScope:!0,itemType:"http://schema.org/Article"},i.createElement("header",null,i.createElement("h2",null,i.createElement(w.Link,{to:t.fields.slug,itemProp:"url"},i.createElement("span",{itemProp:"headline"},a))),i.createElement("small",null,t.frontmatter.date," • "+(0,y.P)(t.timeToRead)," "),i.createElement("div",{style:{display:"flex",flexDirection:"row",gap:"10px"}},t.frontmatter.tags.map((function(e,t){return i.createElement("div",{style:{fontSize:"var(--fontSize-0)",border:"1px solid var(--color-box)",padding:"2px"},key:t},e)})))),i.createElement("section",null,i.createElement("p",{dangerouslySetInnerHTML:{__html:t.frontmatter.description||t.excerpt},itemProp:"description"}))))},E=i.memo(k),x=function(e){var t=e.data,a=(0,i.useState)([]),r=a[0],n=a[1],l=i.useMemo((function(){return t.allMarkdownRemark.nodes}),[t]),c=i.useMemo((function(){return Object.entries(l.reduce((function(e,t){var a,i;return null===(a=t.frontmatter)||void 0===a||null===(i=a.tags)||void 0===i?void 0:i.reduce((function(e,t){var a;return Object.assign({},e,((a={})[t]=(e[t]||0)+1,a))}),e)}),{})).map((function(e){return{name:e[0],count:e[1]}})).sort((function(e,t){return e.count===t.count?e.name>t.name?1:-1:e.count<t.count?1:-1})).map((function(e){return Object.assign({},e,{selected:!1})}))}),[l]),s=(0,i.useState)(""),f=s[0],d=s[1],m=f.toLowerCase(),p=l.filter((function(e){var t,a,i,n,l,o;return((null===(t=e.frontmatter)||void 0===t||null===(a=t.title)||void 0===a?void 0:a.toLowerCase().includes(m))||(null===(i=e.frontmatter)||void 0===i||null===(n=i.description)||void 0===n?void 0:n.toLowerCase().includes(m))||void 0===(null===(l=e.frontmatter)||void 0===l?void 0:l.description)&&(null===(o=e.excerpt)||void 0===o?void 0:o.toLowerCase().includes(m)))&&(0===r.length||e.frontmatter.tags.some((function(e){return r.includes(e)})))})),g=i.useCallback((function(e){var t=e.target;n((function(e){return e.includes(t.value)?e.filter((function(e){return t.value!==e})):[].concat((0,o.Z)(e),[t.value])}))}),[]);return i.createElement(i.Fragment,null,i.createElement(u,{query:f,onChange:i.useCallback((function(e){return d(e.target.value)}),[])}),i.createElement(v,{tags:c,onTagSelect:g,selectedTags:r}),i.createElement("ol",{style:{listStyle:"none"}},p.map((function(e){return i.createElement(E,{post:e,key:e.fields.slug})}))),0===p.length&&i.createElement("p",{className:"post-list-item h2"},"No matching article found"))},S=function(e){var t,a=e.data,o=e.location,c=(null===(t=a.site.siteMetadata)||void 0===t?void 0:t.title)||"Title";return i.createElement(n.Z,{location:o,title:c},i.createElement(l.Z,{title:"All posts"}),i.createElement(x,{data:a}),i.createElement(r.Z,null))}},5868:function(e,t,a){function i(e){var t=Math.round(e/5);return t>5?new Array(Math.round(t/Math.E)).fill("🍱").join("")+" "+e+" min read":new Array(t||1).fill("☕️").join("")+" "+e+" min read"}a.d(t,{P:function(){return i}})},1550:function(e){e.exports=JSON.parse('{"layout":"fixed","backgroundColor":"#e8b898","images":{"fallback":{"src":"/static/6c1bcbdf46a2fea83758f5a7e088aea8/e5610/profile-pic.png","srcSet":"/static/6c1bcbdf46a2fea83758f5a7e088aea8/e5610/profile-pic.png 50w","sizes":"50px"},"sources":[{"srcSet":"/static/6c1bcbdf46a2fea83758f5a7e088aea8/d4bf4/profile-pic.avif 50w","type":"image/avif","sizes":"50px"},{"srcSet":"/static/6c1bcbdf46a2fea83758f5a7e088aea8/3faea/profile-pic.webp 50w","type":"image/webp","sizes":"50px"}]},"width":50,"height":50}')},5753:function(e){e.exports=JSON.parse('{"layout":"fixed","backgroundColor":"#f8f8f8","images":{"fallback":{"src":"/static/d56df49a807a9fd06eb1667a84d3810e/865aa/Github-light.png","srcSet":"/static/d56df49a807a9fd06eb1667a84d3810e/865aa/Github-light.png 32w","sizes":"32px"},"sources":[{"srcSet":"/static/d56df49a807a9fd06eb1667a84d3810e/8e9fb/Github-light.avif 32w","type":"image/avif","sizes":"32px"},{"srcSet":"/static/d56df49a807a9fd06eb1667a84d3810e/3d4da/Github-light.webp 32w","type":"image/webp","sizes":"32px"}]},"width":32,"height":32}')},4242:function(e){e.exports=JSON.parse('{"layout":"fixed","backgroundColor":"#080808","images":{"fallback":{"src":"/static/5233a552c9ee105ed4533a4081c29f79/865aa/stack-overflow.png","srcSet":"/static/5233a552c9ee105ed4533a4081c29f79/865aa/stack-overflow.png 32w,\\n/static/5233a552c9ee105ed4533a4081c29f79/d4e6d/stack-overflow.png 64w","sizes":"32px"},"sources":[{"srcSet":"/static/5233a552c9ee105ed4533a4081c29f79/8e9fb/stack-overflow.avif 32w,\\n/static/5233a552c9ee105ed4533a4081c29f79/cc6c8/stack-overflow.avif 64w","type":"image/avif","sizes":"32px"},{"srcSet":"/static/5233a552c9ee105ed4533a4081c29f79/3d4da/stack-overflow.webp 32w,\\n/static/5233a552c9ee105ed4533a4081c29f79/541c0/stack-overflow.webp 64w","type":"image/webp","sizes":"32px"}]},"width":32,"height":32}')},417:function(e){e.exports=JSON.parse('{"layout":"fixed","backgroundColor":"#181818","images":{"fallback":{"src":"/static/f87561b8bb354ef83b09a66e54f70e08/865aa/Github-dark.png","srcSet":"/static/f87561b8bb354ef83b09a66e54f70e08/865aa/Github-dark.png 32w","sizes":"32px"},"sources":[{"srcSet":"/static/f87561b8bb354ef83b09a66e54f70e08/8e9fb/Github-dark.avif 32w","type":"image/avif","sizes":"32px"},{"srcSet":"/static/f87561b8bb354ef83b09a66e54f70e08/3d4da/Github-dark.webp 32w","type":"image/webp","sizes":"32px"}]},"width":32,"height":32}')}}]);
//# sourceMappingURL=component---src-pages-index-js-6834606a4bb2dfec1832.js.map