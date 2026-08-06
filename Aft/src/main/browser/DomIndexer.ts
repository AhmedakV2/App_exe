import { WebContents } from 'electron'
import { PageState } from './types'

const INDEX_JS = (highlight: boolean): string => `(function(){
  document.querySelectorAll('[data-aft-idx]').forEach(e=>e.removeAttribute('data-aft-idx'));
  const old=document.getElementById('__aft_overlay'); if(old) old.remove();
  const HL=${highlight ? 'true' : 'false'};
  const sel='a,button,input,select,textarea,[role=button],[role=link],[role=tab],[role=checkbox],[onclick],[contenteditable=true]';
  const ov=document.createElement('div');
  ov.id='__aft_overlay';
  ov.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const out=[]; let i=0;
  document.querySelectorAll(sel).forEach(el=>{
    const r=el.getBoundingClientRect(), s=getComputedStyle(el);
    if(r.width<3||r.height<3||s.visibility==='hidden'||s.display==='none') return;
    if(parseFloat(s.opacity||'1')===0||el.disabled) return;
    if(r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth) return;
    el.setAttribute('data-aft-idx',String(i));
    const t=(el.innerText||el.value||el.getAttribute('aria-label')||el.getAttribute('placeholder')||'')
      .replace(/\\s+/g,' ').trim().slice(0,90);
    out.push({i:i,tag:el.tagName.toLowerCase(),type:el.getAttribute('type')||'',
      name:el.getAttribute('name')||'',text:t,
      x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});
    if(HL){
      const b=document.createElement('div');
      b.style.cssText='position:absolute;border:2px solid #ef6c1a;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px';
      const l=document.createElement('span');
      l.textContent=String(i);
      l.style.cssText='position:absolute;top:-15px;left:0;background:#ef6c1a;color:#fff;font:11px monospace;padding:0 4px';
      b.appendChild(l); ov.appendChild(b);
    }
    i++;
  });
  if(HL) document.body.appendChild(ov);
  return {url:location.href,title:document.title,scrollY:Math.round(scrollY),
    pageHeight:Math.round(document.body.scrollHeight),viewport:Math.round(innerHeight),elements:out};
})()`

const CLEAR_JS = `(function(){
  const o=document.getElementById('__aft_overlay'); if(o) o.remove();
  return true;
})()`

export async function snapshot(wc: WebContents, highlight: boolean): Promise<PageState> {
  const res = await wc.debugger.sendCommand('Runtime.evaluate', {
    expression: INDEX_JS(highlight),
    returnByValue: true
  })
  if (res.exceptionDetails) throw new Error('Indeksleme hatasi: ' + res.exceptionDetails.text)
  return res.result.value as PageState
}

export async function clearOverlay(wc: WebContents): Promise<void> {
  await wc.debugger.sendCommand('Runtime.evaluate', { expression: CLEAR_JS, returnByValue: true })
}
