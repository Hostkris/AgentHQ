// Optional browser-native talk-to-text and read-aloud helpers for Agent HQ.
// No recording is uploaded to Agent HQ. Speech recognition availability and
// processing depend on the user's browser/device. Dictation never sends a chat.
(()=>{
 const SpeechRecognizer=window.SpeechRecognition||window.webkitSpeechRecognition;
 const canListen=typeof window.speechSynthesis!=="undefined"&&typeof window.SpeechSynthesisUtterance!=="undefined";
 const root=document.getElementById("app");
 if(!root||(!SpeechRecognizer&&!canListen))return;
 let listening=false,recognizer=null,scheduled=false;
 function feedback(message){
  const area=document.querySelector(".ios-chat-feedback");
  if(area)area.textContent=message;
 }
 function dictate(button){
  if(listening&&recognizer){recognizer.stop();return}
  const draft=document.querySelector(".ios-composer #draft");
  if(!draft)return;
  try{
   const speech=new SpeechRecognizer();
   recognizer=speech;speech.lang=document.documentElement.lang||"en-US";
   speech.continuous=false;speech.interimResults=false;
   speech.onresult=event=>{
    const words=Array.from(event.results||[]).map(result=>result[0]?.transcript||"").join(" ").trim();
    if(!words)return;
    const current=document.querySelector(".ios-composer #draft");
    if(!current)return;
    const previous=current.value.trim();
    current.value=(previous?previous+" ":"")+words;
    current.dispatchEvent(new Event("input",{bubbles:true}));
    current.focus();
   };
   speech.onerror=event=>feedback(event.error==="not-allowed"?"Microphone access was denied. You can still type.":"Dictation didn't finish. Try again or type your message.");
   speech.onend=()=>{
    listening=false;recognizer=null;
    const active=document.querySelector(".voice-dictate");
    if(active){active.classList.remove("recording");active.setAttribute("aria-label","Dictate message")}
   };
   speech.start();
   listening=true;button.classList.add("recording");button.setAttribute("aria-label","Stop dictating");
  }catch{listening=false;feedback("Dictation isn't supported here. Use your iPhone keyboard microphone instead.")}
 }
 function readLast(){
  if(!canListen)return;
  const incoming=[...document.querySelectorAll(".ios-chat-list .ios-message-row.incoming .ios-message-text")];
  const text=incoming.at(-1)?.textContent?.trim();
  if(!text)return;
  try{
   window.speechSynthesis.cancel();
   const utterance=new window.SpeechSynthesisUtterance(text.slice(0,3000));
   utterance.rate=1;utterance.pitch=1;
   window.speechSynthesis.speak(utterance);
  }catch{feedback("Read aloud is unavailable on this device.")}
 }
 function refresh(){
  const composer=document.querySelector(".ios-composer");
  if(!composer){
   if(listening&&recognizer){recognizer.stop()}
   return;
  }
  if(SpeechRecognizer&&!composer.querySelector(".voice-dictate")){
   const button=document.createElement("button");
   button.type="button";button.className="voice-dictate";
   button.textContent="🎙";button.setAttribute("aria-label","Dictate message");
   button.title="Dictate without sending";
   button.addEventListener("click",()=>dictate(button));
   composer.insertBefore(button,composer.querySelector(".ios-send"));
  }
  const header=document.querySelector(".ios-chat-header");
  if(canListen&&header&&!header.querySelector(".voice-read-last")){
   const button=document.createElement("button");
   button.type="button";button.className="voice-read-last";
   button.textContent="🔊";button.setAttribute("aria-label","Read last worker reply aloud");
   button.title="Read last reply in device voice";
   button.addEventListener("click",readLast);
   const refreshButton=header.querySelector(".ios-refresh");
   if(refreshButton)refreshButton.before(button);
   else header.appendChild(button);
  }
 }
 const observer=new MutationObserver(()=>{
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;refresh()});
 });
 observer.observe(root,{subtree:true,childList:true});
 refresh();
})();
