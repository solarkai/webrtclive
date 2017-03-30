
//全局变量定义
var wsuri = 'ws://'+document.location.host+':80';
var wsocket;

/*页面元素定义*/
var agentRegBtn ;
var getMediaBtn;
var agentQuitBtn ;
var ipclistUl ;
var pageState;
var sidebar;
var ipcId = -1;

//媒体元素定义
var  localStream;
var  localPeerConnections = {};

window.URL = window.URL || window.webkitURL || window.msURL || window.oURL;
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia|| navigator.mozGetUserMedia || navigator.msGetUserMedia;
/*var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || 
                       window.webkitRTCPeerConnection || window.msRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription ||
                       window.webkitRTCSessionDescription || window.msRTCSessionDescription;*/
// Chrome
if (navigator.webkitGetUserMedia) {
	RTCPeerConnection = webkitRTCPeerConnection;
	// Firefox
	} else if(navigator.mozGetUserMedia){
	RTCPeerConnection = mozRTCPeerConnection;
	RTCSessionDescription = mozRTCSessionDescription;
	RTCIceCandidate = mozRTCIceCandidate;
	}
trace("RTCPeerConnection object: " + RTCPeerConnection);

function trace(text) {
	  console.log((performance.now() / 1000).toFixed(3) + ": " + text);
}

function logOperation(msg)
{
   if(sidebar.hidden)
   {
	 sidebar.hidden = false;  
   }	
   sidebar.innerHTML += msg+'<br>';
}

function closeBrowserConn(browserId)
{
	logOperation('Browser '+browserId+' disconnected.');
	localPeerConnections[browserId].close();
	delete localPeerConnections[browserId];
}
	
/*获取摄像头的码流*/
function onGetMediaBtnClick(event)
{
	trace("++++++++++Requesting local stream");
	navigator.getUserMedia({audio:true, video:true}, gotStream,
		function(error) {
		  trace("getUserMedia error: ", error);
		});
	getMediaBtn.disabled = true;
	
	
}

function gotStream(stream){
	  trace("++++++++++Received local stream");
	  localVideo.src = URL.createObjectURL(stream);
	  localStream = stream; 
	  if(localVideo.hidden)
	  {
		 localVideo.hidden = false; 
	  } 
}


/*浏览器客户端注册*/
function agentRegister(event)
{
	wsocket = new WebSocket(wsuri);
	wsocket.onopen = function (evt){onOpen(evt)};
	wsocket.onclose = function (evt){onClose(evt)};
	wsocket.onmessage = function (evt){onMessage(evt)};
	wsocket.onerror = function (evt){onError(evt)};	
	
}

/*IPC 连接退出*/
function agentExit(event)
{
	logOperation('IPC '+ipcId+' turn off.');
	ipcId = -1
	wsocket.close();
	wsocket = null;
	for (id in localPeerConnections)
	{
		if(localPeerConnections[id])
		{
			localPeerConnections[id].close();
			delete localPeerConnections[id];
		}
	}
	localStream.stop();
	localStream = null;
	//localVideo.src = null;
	localVideo.hidden=true;
	
	
	/*界面初始化*/ 
	document.title = 'IPC模拟客户端: 未注册';
	agentRegBtn.disabled = false;
	getMediaBtn.disabled = true;
	agentQuitBtn.disabled = true; 
	
	
}

/*接收注册回应消息*/
function handleAgentRegRes(sig)
{
   if(sig.errorCode == 0)
   {
	   updatePageStatus("客户端已经注册，客户端ID："+sig.agentId);
	   ipcId = sig.agentId;
	   document.title = 'IPC模拟客户端'+ipcId;
	   //确定页面可用状态
		agentRegBtn.disabled = true;
		getMediaBtn.disabled = false;
		agentQuitBtn.disabled = false; 
   }else
   {
	   alert('客户端注册失败：'+sig.errorDest);
   }
}


/*处理来自浏览器的offer*/
function handleOffer(sig)
{
	var errcode=0,errdesc;
	if(localStream)
	{
		if(localPeerConnections[sig.browserId])
		{ //此浏览器已经申请过了
		    errcode = 2;
			errdesc = 'errorcode2 : Browser'+sig.browserId+' had requested media from IPC '+ipcId;
		}
	}else
	{
		errcode = 1;
		errdesc = 'errorcode1 :media is not ready,the request of Browser'+sig.browserId+' refused!';
	}
	if(errcode !== 0)
	{
	  logOperation(errdesc); 
	  return; 	
	}
	 if(sig.sdp)
	{
	  var servers = null;
	  var pc = new RTCPeerConnection(servers);//pc_config, pc_constraints);//
	  trace("Created ipc peer connection object pc ");
	  pc.browserId = sig.browserId;
	  pc.addStream(localStream);
	  localPeerConnections[sig.browserId] = pc;
	  
	  pc.onicecandidate = gotLocalIceCandidate;
	  //pc.onaddstream = gotIpcStream;
	  pc.oniceconnectionstatechange = goticeConnectionState;
	  	
	  createAnswer(pc,sig);	  
	}else
	{
		alert("无效的browser发出的Offer请求，来自browser "+sig.browserId);
	} 
}

/*创建来自ipc的answer*/
function createAnswer(rpc,sig)
{
    var sdptext;
	if(sig.sessionDescription)
	{
		sdptext = SDP.generate(sig.sessionDescription);
		if(!sdptext)
		{
			trace('++++++++++generate offer obj fail:'+sig.sessionDescription);
			return;
		}
	}
	if(!sdptext && sig.sdp)
	{
	   sdptext = sig.sdp;	
	}
   var v1 = {
	          type:sig.type,
			  sdp:sdptext
	        };
   var remoteDesc = new RTCSessionDescription(v1);
   trace("++++++++++Offer from browser:"+sig.browserId +"\n" + sig.sdp);
   rpc.setRemoteDescription(remoteDesc);
   rpc.createAnswer(function (description){
	    rpc.setLocalDescription(description);
	    trace("++++++++++Answer from ipc: \n" + description.sdp);
		var sessionDescription = SDP.parse(description.sdp);
        if (!sessionDescription)
		   {
			 alert("分析sdp文本失败，无法建立answer!");
			 return;
		   }
		var mediaAnswer  = {
            type: description.type,
            browserId:sig.browserId,
            ipcId: sig.ipcId, 
            sdp: description.sdp,
			sessionDescription:sessionDescription
           }
        postMessage(JSON.stringify(mediaAnswer));
	   }
   ,handleError);
}

/*处理来自浏览器的candidate*/
function handleBrowserCandidate(sig)
{
	if(localPeerConnections[sig.browserId])
	{
		var d = sig.candidate.candidateDescription;
        if (d ) {
            sig.candidate.candidate = "candidate:" + [
                d.foundation,
                d.componentId,
                d.transport,
                d.priority,
                d.address,
                d.port,
                "typ",
                d.type,
                d.relatedAddress && ("raddr " + d.relatedAddress),
                d.relatedPort && ("rport " + d.relatedPort),
                d.tcpType && ("tcptype " + d.tcpType)
            ].filter(function (x) { return x; }).join(" ");
		}
		/*var v1 = {
					sdpMLineIndex:sig.sdpMLineIndex,
					sdpMid:sig.sdpMid,
					candidate:sig.candidate
			    };*/
		localPeerConnections[sig.browserId].addIceCandidate(new RTCIceCandidate(sig.candidate));
		trace("++++++++++BrowserCandidate from browser:"+sig.browserId+ "\n" + sig.candidate);	
	}
}

/*处理来自浏览器的bye消息*/
function handleBye(sig)
{
   trace("++++++++++Got Bye from browser:"+sig.browserId+ "\n");
   if(localPeerConnections[this.browserId])
   {
	 closeBrowserConn(this.browserId);
   }
}


function handleError(err){
  	trace("++++++++++ipc handle peerconnection:"+err);	
}

/*iceConnectionState的变化，判断是否对端断了*/
function goticeConnectionState(event)
{
	trace("++++++++++ goticeConnectionState of browser "+this.browserId+":"+this.iceConnectionState);
	if(this.iceConnectionState == 'connected')
	{
		logOperation('Browser '+this.browserId+' connected.');
	}
	if(this.iceConnectionState == 'disconnected' && localPeerConnections[this.browserId])
	{
		closeBrowserConn(this.browserId);
	}
}

/*获取本地的IceCandidate*/
function gotLocalIceCandidate(event){
	  if (event.candidate) {
		  var s;
		  if(event.candidate.candidate.substr(0,2) == 'a=')
		  {
		     s = SDP.parse("m=application 0 NONE\r\n" + event.candidate.candidate + "\r\n");
		  }else
		  {
			 s = SDP.parse("m=application 0 NONE\r\na=" + event.candidate.candidate + "\r\n");
		  }
          var candidateDescription = s && s.mediaDescriptions[0].ice.candidates[0];
          if (!candidateDescription)
		       {
				trace("++++++++++convert candidateDescription fail:"+event.candidate.candidate);
                return;
			   }
		 
		var ipcCandidate  = {
				type:'ipcCandidate',
				browserId:this.browserId,
				ipcId: ipcId,
				candidate:{
					 candidate: event.candidate.candidate,
					 candidateDescription: candidateDescription,
					 sdpMLineIndex: event.candidate.sdpMLineIndex
				}
            };
		postMessage(JSON.stringify(ipcCandidate));
		trace("++++++++++gotLocalIceCandidate for browser "+this.browserId+" : \n" + event.candidate.candidate);
	  }
}

/*页面初始化函数*/
function init()
{
	//获取页面元素变量
	agentRegBtn = document.getElementById('agentReg');
	getMediaBtn = document.getElementById('getMedia');
	agentQuitBtn = document.getElementById('agentQuit');
	ipclistUl = document.getElementById('ipclist');
	refreshIpcListBtn = document.getElementById('refreshIpcList');
	sidebar = document.getElementById('sidebar');
	
	//确定页面可用状态
	agentRegBtn.disabled = false;
	getMediaBtn.disabled = true;
	agentQuitBtn.disabled = true;
	
	//增加元素的事件
	getMediaBtn.addEventListener('click',onGetMediaBtnClick,false);
	agentRegBtn.onclick = agentRegister;
	agentQuitBtn.onclick = agentExit;
	
	
} 

function onOpen(evt)
{
    updatePageStatus('客户端状态：已连接服务器');
	//发送注册请求
	var agentRegReq = {
		  type:'agentRegReq',
		  agentType:'ipc',
		  agentDesc:'ipc simulator'
		};
	postMessage(JSON.stringify(agentRegReq));	
}

function onClose(evt)
{
  trace('connection closed');
  alert('IPC模拟客户端与服务器的连接关闭,页面功能不可用！');
  if(ipcId > -1)
  {
  agentExit();
  }
}

function onMessage(evt)
{
  updatePageStatus('message received '+evt.data);
  signal = JSON.parse(evt.data);
   if (signal) {
	 switch(signal.type)
	 {
		 case 'agentRegRes':
		 handleAgentRegRes(signal);
		 break;
		 
		 case 'offer':
		 handleOffer(signal);
		 break;
		 
		 case 'browserCandidate':
		 handleBrowserCandidate(signal);
		 break;
		 
		 case 'bye':
		 handleBye(signal);
		 break;
		 
		 default:
		 break;
	  }
   }else
   {
	 trace("invalid signal: "+evt.data);
   }
  
}

function onError(evt)
{
  trace('error:'+evt.data);
}

function postMessage(msg)
{
  trace('send message:'+msg);
  wsocket.send(msg);
}

function closeMessage()
{
   trace('socket closed');
   wsocket.close();
}

function updatePageStatus(msg)
{
   document.getElementById('pageState').innerHTML = msg;
}



window.addEventListener('load',init,false);
