// Eleanor notifications: lock-screen details stay generic and private.
// Never execute an approval from a push event or untrusted notification payload.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function destination(payload){
 const u=new URL('./?secretary=1',self.registration.scope);
 if(payload?.kind==='agent_attention'){
  u.searchParams.set('agentAlerts','1');
  if(uuid.test(String(payload.alert_id||'')))u.searchParams.set('alert',payload.alert_id);
 }
 return u.href;
}
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const isWork=data.kind==='agent_attention';
 const body=isWork?'An agent needs your attention. Open Agent HQ to review.':
  'You have a private secretary update. Open Agent HQ.';
 const tag=typeof data.tag==='string'?data.tag.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80):'eleanor-update';
 event.waitUntil((async()=>{
  await self.registration.showNotification('Eleanor · Agent HQ',{
   body,tag,icon:'./icon.svg',badge:'./icon.svg',
   data:{url:destination(data)}
  });
  // Badge is informational only. It never grants approval.
  if(self.navigator?.setAppBadge)try{await self.navigator.setAppBadge(1)}catch{}
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=event.notification.data?.url;
 const target=typeof url==='string'&&url.startsWith(self.registration.scope)?url:
  destination({});
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const w of windows){
   if(w.url.startsWith(self.registration.scope)&&'focus' in w){
    if('navigate' in w)await w.navigate(target);
    return w.focus();
   }
  }
  return self.clients.openWindow(target);
 })());
});
