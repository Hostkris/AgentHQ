import { agentCloud } from './agent-cloud-auth.js';
const panel=document.createElement('section');
panel.id='agent-cloud-panel';
panel.style.cssText='padding:12px;text-align:center';
panel.innerHTML='<p>Agent HQ secure sign-in</p><form id="cloud-form"><input id="cloud-email" type="email" required placeholder="Email address" autocomplete="email"><button>Send sign-in link</button></form><button id="cloud-logout" hidden>Sign out</button><p id="cloud-status">Checking session…</p>';
document.querySelector('#app').before(panel);
const status=panel.querySelector('#cloud-status'),form=panel.querySelector('#cloud-form'),logout=panel.querySelector('#cloud-logout');
async function refresh(){const {data}=await agentCloud.auth.getUser();const user=data?.user;form.hidden=!!user;logout.hidden=!user;status.textContent=user?'Signed in as '+user.email:'Sign in to sync messages securely.';window.dispatchEvent(new Event('agent-hq-auth'));}
form.addEventListener('submit',async e=>{e.preventDefault();status.textContent='Sending sign-in link…';const email=panel.querySelector('#cloud-email').value.trim();const {error}=await agentCloud.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});status.textContent=error?error.message:'Check your email for the sign-in link.';});
logout.addEventListener('click',async()=>{await agentCloud.auth.signOut();refresh();});
agentCloud.auth.onAuthStateChange(()=>setTimeout(refresh,0));
refresh();
