const {Gio, GLib}=imports.gi;
const lab=GLib.getenv('NIKO_CONTROLES_LAB');
if(!lab?.startsWith('/tmp/niko-controles.')||GLib.getenv('HOME')!==lab+'/home'||!GLib.getenv('DBUS_SESSION_BUS_ADDRESS')?.includes(lab)||GLib.getenv('DBUS_SYSTEM_BUS_ADDRESS')!==GLib.getenv('DBUS_SESSION_BUS_ADDRESS'))throw Error('Somente laboratório privado');
const bus=Gio.bus_get_sync(Gio.BusType.SESSION,null),objects=[];
let brightness=60,wifi=true,bluetooth=true;
const log=action=>{let values=[];try{values=JSON.parse(new TextDecoder().decode(GLib.file_get_contents(lab+'/calls.json')[1]));}catch{}values.push(action);GLib.file_set_contents(lab+'/calls.json',JSON.stringify(values));};
const dict=values=>Object.fromEntries(Object.entries(values).map(([k,[type,value]])=>[k,new GLib.Variant(type,value)]));
function exported(path,iface,xml,implementation){const obj=Gio.DBusExportedObject.wrapJSObject('<node><interface name="'+iface+'">'+xml+'</interface></node>',implementation);obj.export(bus,path);objects.push(obj);}
const property=(name,type,access='read')=>`<property name="${name}" type="${type}" access="${access}"/>`;
const method=(name,input=[],output=[])=>`<method name="${name}">${input.map(type=>`<arg type="${type}" direction="in"/>`).join('')}${output.map(type=>`<arg type="${type}" direction="out"/>`).join('')}</method>`;
const nm='org.freedesktop.NetworkManager',base='/org/freedesktop/NetworkManager',dev=base+'/Devices/1',ap=base+'/AccessPoint/1',profile=base+'/Settings/1';
exported(base,nm,property('WirelessEnabled','b','readwrite')+method('GetDevices',[],['ao'])+method('ActivateConnection',['o','o','o'],['o'])+method('AddAndActivateConnection',['a{sa{sv}}','o','o'],['o','o']),{
 get WirelessEnabled(){return wifi;},set WirelessEnabled(v){wifi=v;log('wifi:'+v);},GetDevices:()=>[dev],
 ActivateConnection:()=>{log('activate');return base+'/ActiveConnection/1';},
 AddAndActivateConnection:settings=>{const sec=settings['802-11-wireless-security'];if(sec?.psk?.deep_unpack()!=='senha-ficticia')throw Error('missing fictitious password');log('add');return [profile,base+'/ActiveConnection/1'];},
});
exported(dev,nm+'.Device',property('DeviceType','u')+property('State','u')+method('Disconnect'),{get DeviceType(){return 2;},get State(){return 100;},Disconnect:()=>log('disconnect')});
exported(dev,nm+'.Device.Wireless',property('ActiveAccessPoint','o')+method('GetAccessPoints',[],['ao']),{get ActiveAccessPoint(){return ap;},GetAccessPoints:()=>[ap]});
exported(ap,nm+'.AccessPoint',['Ssid','Strength','Flags','WpaFlags','RsnFlags'].map((n,i)=>property(n,['ay','y','u','u','u'][i])).join(''),{get Ssid(){return new TextEncoder().encode('Rede ficticia');},get Strength(){return 72;},get Flags(){return 1;},get WpaFlags(){return 0;},get RsnFlags(){return 256;}});
exported(base+'/Settings',nm+'.Settings',method('ListConnections',[],['ao']),{ListConnections:()=>[profile]});
exported(profile,nm+'.Settings.Connection',method('GetSettings',[],['a{sa{sv}}'])+method('Delete'),{GetSettings:()=>({'802-11-wireless':{ssid:new GLib.Variant('ay',new TextEncoder().encode('Rede ficticia'))}}),Delete:()=>log('delete-fictitious')});
exported('/org/freedesktop/UPower/devices/DisplayDevice','org.freedesktop.UPower.Device',property('IsPresent','b')+property('Type','u')+property('Percentage','d')+property('State','u')+property('TimeToEmpty','t'),{get IsPresent(){return true;},get Type(){return 2;},get Percentage(){return 84;},get State(){return 2;},get TimeToEmpty(){return 7200;}});
exported('/org/gnome/SettingsDaemon/Power','org.gnome.SettingsDaemon.Power.Screen',property('Brightness','i','readwrite'),{get Brightness(){return brightness;},set Brightness(v){brightness=v;log('brightness:'+v);}});
exported('/','org.freedesktop.DBus.ObjectManager',method('GetManagedObjects',[],['a{oa{sa{sv}}}']),{GetManagedObjects:()=>({'/org/bluez/hci0':{'org.bluez.Adapter1':dict({Powered:['b',bluetooth]})},'/org/bluez/hci0/dev_fixture':{'org.bluez.Device1':dict({Name:['s','Fone ficticio'],Paired:['b',true],Connected:['b',true]})}})});
exported('/org/bluez/hci0','org.bluez.Adapter1',property('Powered','b','readwrite'),{get Powered(){return bluetooth;},set Powered(v){bluetooth=v;log('bluetooth:'+v);}});
exported('/org/freedesktop/login1','org.freedesktop.login1.Manager',['Suspend','Reboot','PowerOff'].map(m=>method(m,['b'])).join(''),Object.fromEntries(['Suspend','Reboot','PowerOff'].map(m=>[m,()=>log(m)])));
exported('/org/gnome/ScreenSaver','org.gnome.ScreenSaver',method('Lock'),{Lock:()=>log('Lock')});
exported('/StatusNotifierWatcher','org.kde.StatusNotifierWatcher',property('RegisteredStatusNotifierItems','as'),{get RegisteredStatusNotifierItems(){return ['org.niko.FakeTray/StatusNotifierItem'];}});
exported('/StatusNotifierItem','org.kde.StatusNotifierItem',property('Title','s')+property('Id','s')+property('IconName','s')+property('IconPixmap','a(iiay)')+method('Activate',['i','i']),{get Title(){return 'Bandeja ficticia';},get Id(){return 'fixture';},get IconName(){return '';},get IconPixmap(){return [[1,1,new Uint8Array([255,255,0,0])]];},Activate:()=>log('tray-activate')});
let owners=0;
for(const name of [nm,'org.freedesktop.UPower','org.gnome.SettingsDaemon.Power','org.bluez','org.freedesktop.login1','org.gnome.ScreenSaver','org.kde.StatusNotifierWatcher','org.niko.FakeTray'])Gio.bus_own_name_on_connection(bus,name,Gio.BusNameOwnerFlags.NONE,()=>{if(++owners===8)print('READY');},()=>{throw Error('private name collision');});
new GLib.MainLoop(null,false).run();
