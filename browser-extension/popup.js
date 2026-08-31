const DEFAULT_BASE='https://ardufiyat12-tr.up.railway.app';
const base=document.querySelector('#baseUrl');
const key=document.querySelector('#apiKey');
const message=document.querySelector('#message');
chrome.storage.sync.get({baseUrl:DEFAULT_BASE,apiKey:''},data=>{base.value=data.baseUrl;key.value=data.apiKey||'';});
document.querySelector('#save').onclick=()=>{const value=String(base.value||DEFAULT_BASE).trim().replace(/\/$/,'');chrome.storage.sync.set({baseUrl:value,apiKey:String(key.value||'').trim()},()=>{message.textContent='Kaydedildi.';setTimeout(()=>message.textContent='',1800);});};
document.querySelector('#open').onclick=()=>{const value=String(base.value||DEFAULT_BASE).trim().replace(/\/$/,'');chrome.tabs.create({url:value});};
