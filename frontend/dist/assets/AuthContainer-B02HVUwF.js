import{i as e,o as t,t as n}from"./index-DhD-cjp7.js";var r=t(e(),1),i=n();function a({handleLoginSuccess:e}){let t=(0,r.useRef)(!1),n=(0,r.useCallback)(e=>{let t=e.currentTarget;try{let e=t.contentDocument;if(!e?.head)return;let n=e.createElement(`style`);n.dataset.reactLoginOverrides=`true`,n.textContent=`
        .site-shell::before,
        .site-shell::after,
        .login-3d-carousel { display: none !important; animation: none !important; }
        .login-showcase { display: none !important; }
        .login-section {
          grid-template-columns: minmax(300px, 520px) !important;
          justify-content: center !important;
          align-items: start !important;
        }
        .auth-panel { width: 100% !important; max-width: 520px !important; }
      `,e.head.querySelector(`[data-react-login-overrides]`)?.remove(),e.head.appendChild(n)}catch{}},[]);return(0,r.useEffect)(()=>{let n=window.setInterval(async()=>{if(!(t.current||document.hidden))try{let n=await fetch(`/auth/session-info`,{credentials:`include`});if(!n.ok)return;(await n.json()).authenticated&&(t.current=!0,await e())}catch{}},1200);return()=>window.clearInterval(n)},[e]),(0,i.jsx)(`iframe`,{title:`SVBK ERP Website and Login`,src:`/auth/login`,onLoad:n,style:{display:`block`,width:`100vw`,height:`100vh`,border:0,background:`#060913`}})}export{a as default};