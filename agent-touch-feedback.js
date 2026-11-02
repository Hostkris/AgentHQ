// Shared tactile feedback for the existing Agent HQ controls.
// Visual-only: never substitutes an action, approval, or permission.
(()=>{
 const selector='button,a[href],summary,[role="button"],input[type="checkbox"],input[type="radio"]';
 const timers=new WeakMap();
 const eligible=node=>node&&!node.disabled&&!node.matches('[aria-disabled="true"],[inert]')&&!node.closest('[inert]')&&!node.matches('input[type="hidden"]');
 const pick=target=>{const n=target?.closest?.(selector);return eligible(n)?n:null;};
 const pulse=el=>{
  if(!el)return;
  const prev=timers.get(el);if(prev)clearTimeout(prev);
  el.classList.add('agent-press-feedback');
  timers.set(el,setTimeout(()=>{el.classList.remove('agent-press-feedback');timers.delete(el);},175));
 };
 document.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;pulse(pick(e.target));},true);
 document.addEventListener('click',e=>{const el=pick(e.target);if(el)pulse(el);},true);
 document.addEventListener('keydown',e=>{if(e.repeat||!['Enter',' '].includes(e.key))return;pulse(pick(e.target));},true);
})();
