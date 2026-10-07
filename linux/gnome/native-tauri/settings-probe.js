import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Niko from './production.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class SettingsProbe extends Niko {
 enable(){
  if(GLib.getenv('NIKO_TAURI_HEADLESS')!=='1')throw Error('Somente compositor privado headless');
  super.enable();
  const lab=GLib.getenv('NIKO_NATIVE_LAB');
  this._pointer=Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  let rounds=0,readyAt=0,step=0,busy=false;
  const capture=async(win,name)=>{
   const texture=win.get_compositor_private().paint_to_content(null).get_texture();
   const output=Gio.File.new_for_path(lab+'/'+name).replace(null,false,Gio.FileCreateFlags.PRIVATE,null);
   try{await Shell.Screenshot.composite_to_stream(texture,0,0,-1,-1,1,null,0,0,1,output);}finally{output.close(null);}
  };
  this._test=GLib.timeout_add(GLib.PRIORITY_DEFAULT,250,()=>{
   try{
    if(++rounds>400)throw Error('Prazo do teste gráfico privado');
    Main.overview.hide();
    const win=this._systemWindow();if(!win)return GLib.SOURCE_CONTINUE;
    if(!readyAt)readyAt=GLib.get_monotonic_time();
    if(busy||GLib.get_monotonic_time()-readyAt<8000000)return GLib.SOURCE_CONTINUE;
    if(!step){const frame=win.get_frame_rect(),buffer=win.get_buffer_rect();GLib.file_set_contents(lab+'/settings-geometry.json',JSON.stringify({frame:{x:frame.x,y:frame.y,w:frame.width,h:frame.height},buffer:{x:buffer.x,y:buffer.y,w:buffer.width,h:buffer.height}}));busy=true;void capture(win,'settings-0.png').then(()=>{step=1;busy=false;});return GLib.SOURCE_CONTINUE;}
    if(GLib.file_test(lab+'/settings-finish',GLib.FileTest.EXISTS)){GLib.file_set_contents(lab+'/result','PASS: Tauri/WebKit real, controles embutidos em Configurações → Sistema; inspeção visual privada\n');this._test=0;return GLib.SOURCE_REMOVE;}
    const command=lab+'/settings-click-'+step+'.json';if(!GLib.file_test(command,GLib.FileTest.EXISTS))return GLib.SOURCE_CONTINUE;
    const {x,y}=JSON.parse(new TextDecoder().decode(GLib.file_get_contents(command)[1]));
    const monitor=Main.layoutManager.primaryMonitor;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<monitor.x||y<monitor.y||x>=monitor.x+monitor.width||y>=monitor.y+monitor.height)throw Error('Coordenada fora do monitor privado');
    busy=true;
    win.activate(global.get_current_time());
    const [ox,oy]=this._offset??[0,0];
    this._pointer.notify_absolute_motion(GLib.get_monotonic_time(),x+ox,y+oy);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT,200,()=>{
     const [px,py]=global.get_pointer();
     this._offset=[ox+x-px,oy+y-py];
     this._pointer.notify_absolute_motion(GLib.get_monotonic_time(),x+this._offset[0],y+this._offset[1]);
     GLib.timeout_add(GLib.PRIORITY_DEFAULT,200,()=>{
     console.log("SETTINGS POINTER "+JSON.stringify(global.get_pointer())+" target "+x+","+y);
     this._pointer.notify_button(GLib.get_monotonic_time(),1,Clutter.ButtonState.PRESSED);
     GLib.timeout_add(GLib.PRIORITY_DEFAULT,100,()=>{
     this._pointer.notify_button(GLib.get_monotonic_time(),1,Clutter.ButtonState.RELEASED);return GLib.SOURCE_REMOVE;});
     GLib.timeout_add(GLib.PRIORITY_DEFAULT,1500,()=>{void capture(win,'settings-'+step+'.png').then(()=>{step++;busy=false;});return GLib.SOURCE_REMOVE;});
     return GLib.SOURCE_REMOVE;});
     return GLib.SOURCE_REMOVE;
    });
   }catch(error){GLib.file_set_contents(lab+'/result','FAIL: '+error.message+'\n');this._test=0;return GLib.SOURCE_REMOVE;}
   return GLib.SOURCE_CONTINUE;
  });
 }
 disable(){if(this._test)GLib.source_remove(this._test);this._test=0;this._pointer?.run_dispose();this._pointer=null;super.disable();}
}
