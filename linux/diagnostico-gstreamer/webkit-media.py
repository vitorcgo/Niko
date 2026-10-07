import json, os, pathlib, gi, threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, GLib, WebKit2

lab = pathlib.Path(os.environ['NIKO_MEDIA_LAB'])
def finish(value):
    (lab / 'media-result.json').write_text(json.dumps(value, indent=2))
    Gtk.main_quit()
manager = WebKit2.UserContentManager()
manager.register_script_message_handler('result')
manager.register_script_message_handler('progress')
manager.connect('script-message-received::progress', lambda _m, r: print(r.get_js_value().to_string(), flush=True))
manager.connect('script-message-received::result', lambda _manager, result: finish(json.loads(result.get_js_value().to_string())))
view = WebKit2.WebView.new_with_user_content_manager(manager)
view.get_settings().set_media_playback_requires_user_gesture(False)
view.connect('web-process-terminated', lambda *_: finish({'pass': False, 'error': 'web_process_terminated'}))
window = Gtk.Window(title='Niko isolated WebKit media diagnostic')
window.set_default_size(400, 260)
window.add(view)
window.show_all()
assets = {'audio': 'silence.wav', 'video': 'sample.ogv'}
urls = assets
html = '''<!doctype html><meta charset="utf-8"><body><video id="video" width="320" height="180" muted></video><audio id="audio" muted></audio><script>
const urls=URLS, results={};
async function play(kind) {
 const media=document.getElementById(kind);
 const pixels=new Set(); const canvas=document.createElement('canvas'); canvas.width=160;canvas.height=90;
 const context=canvas.getContext('2d',{willReadFrequently:true});
 let sampling=true;
 const sample=()=>{if(!sampling)return;if(kind==='video'&&media.readyState>=2){context.drawImage(media,0,0,160,90);const data=context.getImageData(0,0,160,90).data;let hash=0;for(let i=0;i<data.length;i+=4)hash=(Math.imul(hash,31)+data[i])|0;pixels.add(hash);}};
 const sampleTimer=setInterval(sample,30);
 window.webkit.messageHandlers.progress.postMessage(kind+':start');
 for(const event of ['loadedmetadata','loadeddata','playing','waiting','stalled','error','ended']) media.addEventListener(event,()=>window.webkit.messageHandlers.progress.postMessage(kind+':'+event+':'+media.currentTime)); media.muted=true; media.volume=0; media.src=urls[kind];
 await new Promise((resolve,reject)=> { media.onended=resolve; media.onerror=()=>reject(Error(kind+':'+media.error?.code)); media.play().catch(reject); });
 sampling=false;clearInterval(sampleTimer);
 const result={duration:media.duration,currentTime:media.currentTime,ended:media.ended};
 if(kind==='video') {result.width=media.videoWidth;result.height=media.videoHeight;result.frames=media.getVideoPlaybackQuality().totalVideoFrames;result.distinctPixelFrames=pixels.size;}
 results[kind]=result;
 if(!result.ended || result.duration<0.9 || (kind==='video' && (result.distinctPixelFrames<2 || result.width!==160))) throw Error('decode invariant '+kind);
}
(async()=>{try {await play('audio');await play('video');window.webkit.messageHandlers.result.postMessage(JSON.stringify({pass:true,results}));}catch(error){window.webkit.messageHandlers.result.postMessage(JSON.stringify({pass:false,error:String(error),results}));}})();
</script>'''.replace('URLS', json.dumps(urls))
view.connect('load-changed', lambda _v, event: print('LOAD', event.value_nick, flush=True))
(lab / 'index.html').write_text(html)
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(lab)))
threading.Thread(target=server.serve_forever, daemon=True).start()
view.load_uri('http://127.0.0.1:' + str(server.server_port) + '/index.html')
GLib.timeout_add_seconds(40, lambda: (finish({'pass': False, 'error': 'timeout'}), False)[1])
Gtk.main()
server.shutdown()
server.server_close()
result=json.loads((lab / 'media-result.json').read_text())
print(json.dumps(result), flush=True)
raise SystemExit(0 if result.get('pass') else 1)
