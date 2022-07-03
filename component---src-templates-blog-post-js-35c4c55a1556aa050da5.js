"use strict";(self.webpackChunkblog=self.webpackChunkblog||[]).push([[989],{8771:function(e,t,a){var i=a(7294),r=a(1597),l=a(7059);t.Z=function(){var e,t,n=(0,r.useStaticQuery)("3257411868"),o=null===(e=n.site.siteMetadata)||void 0===e?void 0:e.author,c=null===(t=n.site.siteMetadata)||void 0===t?void 0:t.social,s=i.useState(null),f=s[0],u=s[1];return i.useEffect((function(){u(window.__theme),window.__onThemeChange2=function(){u(window.__theme)}}),[]),i.createElement(i.Fragment,null,i.createElement("div",{className:"bio"},i.createElement(l.S,{className:"bio-avatar",layout:"fixed",formats:["auto","webp","avif"],src:"../images/profile-pic.png",width:50,height:50,quality:95,alt:"Profile picture",__imageData:a(1550)}),(null==o?void 0:o.name)&&i.createElement("p",null,"technical blog by"," ",i.createElement("a",{href:"https://twitter.com/"+((null==c?void 0:c.twitter)||"")},i.createElement("strong",null,o.name)),i.createElement("br",null),(null==o?void 0:o.summary)||null)),i.createElement("div",{style:{display:"flex",flexDirection:"row",gap:"1rem"}},i.createElement("a",{href:"https://github.com/murugu-21",alt:"link to author's github profile"},"light"===f?i.createElement(l.S,{layout:"fixed",formats:["auto","webp","avif"],src:"../images/Github-dark.png",width:32,height:32,quality:95,alt:"Github profile link dark",__error:'No data found for image "../images/Github-dark.png"\n              undefinedCould not read image data file "/home/runner/work/murugu-21.github.io/murugu-21.github.io/.cache/caches/gatsby-plugin-image/461395430.json". \nThis may mean that the images in "/home/runner/work/murugu-21.github.io/murugu-21.github.io/src/components/bio.js" were not processed.\nPlease ensure that your gatsby version is at least 2.24.78.'}):i.createElement(l.S,{layout:"fixed",formats:["auto","webp","avif"],src:"../images/Github-light.png",width:32,height:32,quality:95,alt:"Github profile link light",__imageData:a(5753)})),i.createElement("a",{href:"https://stackoverflow.com/users/15790108/murugappan-m",alt:"link to author's stackoverflow profile"},i.createElement(l.S,{layout:"fixed",formats:["auto","webp","avif"],src:"../images/stack-overflow.png",width:32,height:32,quality:95,alt:"stackoverflow profile link",__imageData:a(4242)}))))}},4982:function(e,t,a){a.r(t);var i=a(7294),r=a(1597),l=a(8771),n=a(3508),o=a(262),c=a(5868);t.default=function(e){var t,a=e.data,s=e.location,f=a.markdownRemark,u=(null===(t=a.site.siteMetadata)||void 0===t?void 0:t.title)||"Title",d=a.previous,m=a.next;return i.createElement(n.Z,{location:s,title:u},i.createElement(o.Z,{title:f.frontmatter.title,description:f.frontmatter.description||f.excerpt}),i.createElement("article",{className:"blog-post",itemScope:!0,itemType:"http://schema.org/Article"},i.createElement("header",null,i.createElement("h1",{itemProp:"headline"},f.frontmatter.title),i.createElement("p",null,f.frontmatter.date," • "+(0,c.P)(f.timeToRead)," ")),i.createElement("section",{dangerouslySetInnerHTML:{__html:f.html},itemProp:"articleBody"}),i.createElement("hr",null),i.createElement("footer",null,i.createElement(l.Z,null))),i.createElement("nav",{className:"blog-post-nav"},i.createElement("ul",{style:{display:"flex",flexWrap:"wrap",justifyContent:"space-between",listStyle:"none",padding:0}},i.createElement("li",null,d&&i.createElement(r.Link,{to:d.fields.slug,rel:"prev"},"← ",d.frontmatter.title)),i.createElement("li",null,m&&i.createElement(r.Link,{to:m.fields.slug,rel:"next"},m.frontmatter.title," →")))))}},5868:function(e,t,a){function i(e){var t=Math.round(e/5);return t>5?new Array(Math.round(t/Math.E)).fill("🍱").join("")+" "+e+" min read":new Array(t||1).fill("☕️").join("")+" "+e+" min read"}a.d(t,{P:function(){return i}})},1550:function(e){e.exports=JSON.parse('{"layout":"fixed","backgroundColor":"#e8b898","images":{"fallback":{"src":"/static/6c1bcbdf46a2fea83758f5a7e088aea8/e5610/profile-pic.png","srcSet":"/static/6c1bcbdf46a2fea83758f5a7e088aea8/e5610/profile-pic.png 50w","sizes":"50px"},"sources":[{"srcSet":"/static/6c1bcbdf46a2fea83758f5a7e088aea8/d4bf4/profile-pic.avif 50w","type":"image/avif","sizes":"50px"},{"srcSet":"/static/6c1bcbdf46a2fea83758f5a7e088aea8/3faea/profile-pic.webp 50w","type":"image/webp","sizes":"50px"}]},"width":50,"height":50}')},5753:function(e){e.exports=JSON.parse('{"layout":"fixed","backgroundColor":"#f8f8f8","images":{"fallback":{"src":"/static/d56df49a807a9fd06eb1667a84d3810e/865aa/Github-light.png","srcSet":"/static/d56df49a807a9fd06eb1667a84d3810e/865aa/Github-light.png 32w","sizes":"32px"},"sources":[{"srcSet":"/static/d56df49a807a9fd06eb1667a84d3810e/8e9fb/Github-light.avif 32w","type":"image/avif","sizes":"32px"},{"srcSet":"/static/d56df49a807a9fd06eb1667a84d3810e/3d4da/Github-light.webp 32w","type":"image/webp","sizes":"32px"}]},"width":32,"height":32}')},4242:function(e){e.exports=JSON.parse('{"layout":"fixed","backgroundColor":"#080808","images":{"fallback":{"src":"/static/5233a552c9ee105ed4533a4081c29f79/865aa/stack-overflow.png","srcSet":"/static/5233a552c9ee105ed4533a4081c29f79/865aa/stack-overflow.png 32w,\\n/static/5233a552c9ee105ed4533a4081c29f79/d4e6d/stack-overflow.png 64w","sizes":"32px"},"sources":[{"srcSet":"/static/5233a552c9ee105ed4533a4081c29f79/8e9fb/stack-overflow.avif 32w,\\n/static/5233a552c9ee105ed4533a4081c29f79/cc6c8/stack-overflow.avif 64w","type":"image/avif","sizes":"32px"},{"srcSet":"/static/5233a552c9ee105ed4533a4081c29f79/3d4da/stack-overflow.webp 32w,\\n/static/5233a552c9ee105ed4533a4081c29f79/541c0/stack-overflow.webp 64w","type":"image/webp","sizes":"32px"}]},"width":32,"height":32}')}}]);
//# sourceMappingURL=component---src-templates-blog-post-js-35c4c55a1556aa050da5.js.map