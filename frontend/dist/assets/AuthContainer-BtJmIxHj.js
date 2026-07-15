import{i as e,o as t,t as n}from"./index-Cv6As0Jr.js";var r=t(e(),1),i=n();function a({handleLoginSuccess:e}){let t=(0,r.useRef)(!1),n=(0,r.useRef)(null),a=(0,r.useCallback)(e=>{let t=e.currentTarget;try{let e=t.contentDocument;if(!e?.head)return;let n=e.createElement(`style`);n.dataset.reactLoginOverrides=`true`,n.textContent=`
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
      `,e.head.querySelector(`[data-react-login-overrides]`)?.remove(),e.head.appendChild(n)}catch{}},[]);return(0,r.useEffect)(()=>{let r=async r=>{if(!(r.origin!==window.location.origin||r.source!==n.current?.contentWindow||r.data?.type!==`BKNR_AUTH_SUCCESS`||t.current)){t.current=!0;try{await e()}catch{t.current=!1}}};return window.addEventListener(`message`,r),()=>window.removeEventListener(`message`,r)},[e]),(0,i.jsx)(`iframe`,{ref:n,title:`SVBK ERP Website and Login`,src:`/auth/login`,onLoad:a,style:{display:`block`,width:`100vw`,height:`100vh`,border:0,background:`#060913`}})}export{a as default};