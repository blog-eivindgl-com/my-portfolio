(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[446],{6544:function(t,e,n){(window.__NEXT_P=window.__NEXT_P||[]).push(["/stocks/create",function(){return n(8126)}])},6873:function(t,e,n){"use strict";n.d(e,{L6:function(){return i},Nt:function(){return s},op:function(){return a}});var r=n(9520);let c=new r.default("my-portfolio");c.version(1).stores({stocks:"ticker, name",accounts:"++id, name",transactions:"++id, type, ticker, accountId, date, description, shares, price, brokerage"});let a=c.table("stocks"),s=c.table("accounts"),i=c.table("transactions")},8126:function(t,e,n){"use strict";n.r(e),n.d(e,{default:function(){return s}});var r=n(5893),c=n(6873);let a=()=>{let t=async t=>{t.preventDefault();let e={ticker:t.target.ticker.value,name:t.target.name.value};try{await c.op.add(e),t.target.reset()}catch(t){console.error("Failed to create ".concat(e,": ").concat(t))}};return(0,r.jsxs)("div",{children:[(0,r.jsx)("h1",{children:"Create stock"}),(0,r.jsxs)("form",{onSubmit:t,children:[(0,r.jsx)("label",{htmlFor:"ticker",children:"Ticker:"}),(0,r.jsx)("br",{}),(0,r.jsx)("input",{type:"text",id:"ticker",name:"ticker"}),(0,r.jsx)("br",{})," ",(0,r.jsx)("br",{}),(0,r.jsx)("label",{htmlFor:"name",children:"Name:"}),(0,r.jsx)("br",{}),(0,r.jsx)("input",{type:"text",id:"name",name:"name"}),(0,r.jsx)("br",{})," ",(0,r.jsx)("br",{}),(0,r.jsx)("button",{type:"submit",children:"Create"})]})]})};var s=function(){return(0,r.jsx)("div",{children:(0,r.jsx)(a,{})})}}},function(t){t.O(0,[774,520,888,179],function(){return t(t.s=6544)}),_N_E=t.O()}]);