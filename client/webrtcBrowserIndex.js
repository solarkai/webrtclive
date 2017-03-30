
//全局变量定义
var wsuri = 'ws://'+document.location.host+':80';
var wsocket;

/*页面元素定义*/
var agentRegBtn ;
var refreshIpcListBtn;
var mediaReqBtn ;
var agentQuitBtn ;
var ipclistUl ;
var sidebarDiv;
var videoContent;
var pageState;
var textnodeId;

/*全局容器和变量*/
var browserId = -1;
var browserPeerConnections = {};

window.URL = window.URL || window.webkitURL || window.msURL || window.oURL;
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia|| navigator.mozGetUserMedia || navigator.msGetUserMedia;
// Chrome
if (navigator.webkitGetUserMedia) {
	RTCPeerConnection = webkitRTCPeerConnection;
	// Firefox
	} else if(navigator.mozGetUserMedia){
	RTCPeerConnection = mozRTCPeerConnection;
	RTCSessionDescription = mozRTCSessionDescription;
	RTCIceCandidate = mozRTCIceCandidate;
	}
//trace("RTCPeerConnection object: " + RTCPeerConnection);

if (!window.SDP) {
    console.error("+-------------------------WARNING-------------------------+");
    console.error("| sdp.js not found, will not transform signaling messages |");
    console.error("+---------------------------------------------------------+");
    window.SDP = { "parse": function () {}, "generate": function () {} };
}

function trace(text) {
	  console.log((performance.now() / 1000).toFixed(3) + ": " + text);
}

/*刷新ipc列表*/
function onRefreshIpcListBtnClick(event)
{
	var ipcRefreshReq = {
		  type:'ipcRefreshReq'
		};
	postMessage(JSON.stringify(ipcRefreshReq));
	
}

/*刷新页面ipc列表显示*/
function refreshIpcList(ipcs)
{
	//删除当前所有子节点
	var nodecount = ipclistUl.childNodes.length;
	for(var i=0;i<nodecount;i++)
	{
	  ipclistUl.removeChild(ipclistUl.childNodes[0]);
	}
	//增加子节点
	if(ipcs.length>0)
	{
	  sidebarDiv.hidden = false;	
	}else
	{
	  sidebarDiv.hidden = true;
	}
	for(var i=0;i<ipcs.length;i++)
	{
		var ipc = ipcs[i];
		
		var hr = document.createElement('hr');
		var li = document.createElement('li');
		li.id = "ipc"+ipc.ipcId;
		li.textContent = "IPC "+ipc.ipcId;
		li.value = ipc.ipcId;
		li.title = "this is "+li.textContent;
		
		var inputRadio = document.createElement('input');
		inputRadio.type = "radio";
		inputRadio.name = "ipcradio";
		inputRadio.id = "inputRadio"+ipc.ipcId;
		inputRadio.ipcId = ipc.ipcId;
		if (i == 0)
			inputRadio.checked = "checked";
		//inputRadio.style = "float:left;";
		
		li.appendChild(inputRadio);
		
		ipclistUl.appendChild(hr);
		ipclistUl.appendChild(li);
	}
	
}

/*从videoContent中删除关闭IPC的div*/
function removeVideoContainer(ipcid)
{
	var vcs = document.querySelectorAll('#content '+'#ipcdiv'+ipcid);
	if(vcs[0])
	{
		videoContent.removeChild(vcs[0]);
	}	
}

/*video容器上的关闭按钮被点击*/
function closeVideocontainer(event)
{
	sendBye2Ipc(this.ipcId); 
	browserPeerConnections[this.ipcId].close();
	delete browserPeerConnections[this.ipcId];
	removeVideoContainer(this.ipcId);
	
}

/*向IPC发送BYE消息*/
function sendBye2Ipc(ipcId)
{
  var mediaBye ={
	  type: "bye",
	  browserId:browserId,
	  ipcId:ipcId
	};
	postMessage(JSON.stringify(mediaBye));
	trace("++++++++++Send bye to ipc:"+ipcId+"\n");
}

//*************************界面元素操作函数****************************************************
/*向IPC请求流*/
function requestMediaFromIpc(event)
{
	var radios = document.querySelectorAll("#ipclist input");
	for(var i=0;i<radios.length;i++)
	{
	  var li = radios[i];
	  if(radios[i].type == "radio")
	  {
		  if(radios[i].checked)
		  {
			  if(document.getElementById('ipcdiv'+radios[i].ipcId))
			  {
				 alert("已请求IPC"+radios[i].ipcId+'的媒体流！');
				 return;
			  }
			  else
			  {
				trace("向 IPC "+ radios[i].ipcId+" 请求媒体流");
				createPc(radios[i].ipcId);
				return;
			  }
		  }
	  }
	}
	alert("请先选择一个IPC用于媒体流浏览");
}


/*创建媒体发送者的peerconnection*/
function createPc(ipcId)
{
   var servers = null;
   var localPeerConnection = new RTCPeerConnection(servers);//;pc_config, pc_constraints);//
   localPeerConnection.ipcId = ipcId;
   trace("Created local peer connection for ipc "+ipcId);
   browserPeerConnections[ipcId] = localPeerConnection;
   
   localPeerConnection.oniceconnectionstatechange = goticeConnectionState;
   localPeerConnection.onicecandidate = gotBrowserIceCandidate;
   localPeerConnection.onaddstream = gotIpcStream;
   //localPeerConnection.addStream(localStream);
   //trace("Added localStream to localPeerConnection for browser "+browserId);
   
    var mediaConstraints = {
						optional: [],
						mandatory: {
                        OfferToReceiveAudio: false,
                        OfferToReceiveVideo: true
						 }
                };

   localPeerConnection.createOffer(function (description){
				  localPeerConnection.setLocalDescription(description);
				  trace("++++++++++Offer from localPeerConnection for ipc "+ipcId+": \n" + description.sdp);
				  var sessionDescription = SDP.parse(description.sdp);
                  if (!sessionDescription)
				     {
					   alert("分析sdp文本失败，无法建立offer!");
					   return;
					 }
				  var mediaOffer ={
						  type: description.type,
						  browserId:browserId,
						  ipcId:ipcId,
						  sdp: description.sdp,
						  sessionDescription:sessionDescription
					  };
				  postMessage(JSON.stringify(mediaOffer));
				},handleError,mediaConstraints);
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

/*浏览器客户端退出*/
function agentQuit(event)
{
	//断开websocket和所有peerconnection
	for (id in browserPeerConnections)
	{
		if(browserPeerConnections[id])
		{
			sendBye2Ipc(id);
			browserPeerConnections[id].close();
			delete browserPeerConnections[id];
		}
	}
	if(wsocket)
	{
		wsocket.close();
		wsocket = null;
	}	
	if(browserId > 0)
	{
		trace('++++++++++Browser '+browserId+' turn off.');
		browserId = -1;
	}
	/*界面初始化*/ 
	document.title = 'webrtc浏览客户端: 未注册';
	agentRegBtn.disabled = false;
	refreshIpcListBtn.disabled = true;
	mediaReqBtn.disabled = true;
	agentQuitBtn.disabled = true;
	sidebarDiv.hidden = true;
	updatePageStatus('turnoff');
	
	//删除IPC列表中当前所有子节点
	var nodecount = ipclistUl.childNodes.length;
	for(var i=0;i<nodecount;i++)
	{
	  ipclistUl.removeChild(ipclistUl.childNodes[0]);
	}
	
	//删除content中的所有video元素
	nodecount = videoContent.childNodes.length;
	for(var i=0;i<nodecount;i++)
	{
	  videoContent.removeChild(videoContent.childNodes[0]);
	}
	
  	
}

//****************************信令处理函数************************************************
/*处理注册回应消息*/
function handleAgentRegRes(sig)
{
   if(sig.errorCode == 0)
   {
	  updatePageStatus('turnon',sig.agentId);
	  browserId = sig.agentId;
	   //确定页面可用状态
	  agentRegBtn.disabled = true;
	  refreshIpcListBtn.disabled = false;
	  mediaReqBtn.disabled = false;
	  agentQuitBtn.disabled = false;
	  document.title = 'webrtc浏览客户端:'+browserId; 
   }else
   {
	   alert('客户端注册失败：'+sig.errorDest);
   }
}

/*处理IPC列表刷新消息*/
function handleRefreshIpcs(sig)
{
   if(sig.ipcArray)
   {
	 refreshIpcList(sig.ipcArray);  
	   
   }else
   {
	   alert('获取IPC列表失败！');
   }
}

/*处理来自IPC的answer*/
function handleAnswer(sig)
{
	var sdptext;
	if(sig.sessionDescription)
	{
		sdptext = SDP.generate(sig.sessionDescription);
		if(!sdptext)
		{
			trace('++++++++++generate answer obj fail:'+sig.sessionDescription);
			return;
		}
	}
	if(!sdptext && sig.sdp)
	{
		sdptext = sig.sdp;
	}
	var v1 = {
		       type:sig.type,
			   sdp: sdptext 
		      };
	 var ipcdesc = new RTCSessionDescription(v1);
	 if(browserPeerConnections[sig.ipcId])
	 {
	    browserPeerConnections[sig.ipcId].setRemoteDescription(ipcdesc);
		trace("set answer from ipc "+sig.ipcId+":\n"+sdptext);
	 }
}

/*处理Ipc的Candidate消息*/
function handleIpcCandidate(sig)
{
	if(browserPeerConnections[sig.ipcId])
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
		var v1 = {
			    sdpMLineIndex:sig.candidate.sdpMLineIndex,
                //sdpMid:'video',
                candidate:sig.candidate.candidate
			    };
		
		browserPeerConnections[sig.ipcId].addIceCandidate(new RTCIceCandidate(v1));
		trace("++++++++++IpcCandidate from ipc:"+sig.ipcId+ "\n" + sig.candidate.candidate);	
	}
}


//****************************webrtc 端点处理函数***********************************************************
/*获取浏览器的的icecandidate*/
function gotBrowserIceCandidate(event)
{
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
	    var browserCandidate  = {
            type:"browserCandidate",
            browserId:browserId,
            ipcId:this.ipcId,
			candidate:{
				 candidate: event.candidate.candidate,
				 candidateDescription: candidateDescription,
				 sdpMLineIndex: event.candidate.sdpMLineIndex
				}
            }
		postMessage(JSON.stringify(browserCandidate));
		trace("++++++++++browserCandidate to ipc:"+this.ipcId+"\n"+event.candidate.candidate); 
	 }
}

/*获取来自IPC的码流*/
function gotIpcStream(event)
{
	 var videoDiv = document.createElement('div');
	 videoDiv.className = 'videoContainer bigrounded'; //white roundedDivBorder
	 videoDiv.id = 'ipcdiv'+this.ipcId;
	 
	 var h3 = document.createElement('h3');
	 h3.textContent = 'IPC'+this.ipcId;
	 
	 var btn = document.createElement('button');
	 btn.textContent = 'X';
	 btn.ipcId = this.ipcId;
	 btn.onclick = closeVideocontainer;
	 btn.className = 'bigrounded'; 
	 
	 var remoteVideo = document.createElement('video');
	 remoteVideo.autoplay = true;
	 remoteVideo.controls = true;
	 
   	 remoteVideo.src = URL.createObjectURL(event.stream);
	 if(remoteVideo.hidden)
	 {
	   remoteVideo.hidden= false;
	 }
	 
	 videoDiv.appendChild(h3);
	 videoDiv.appendChild(btn);
	 videoDiv.appendChild(remoteVideo);
	 videoContent.appendChild(videoDiv);
	 trace("++++++++++Received remote stream from ipc:"+this.ipcId+"\n");
}



/*获取与IPC连接的iceCandidate连接状态,处理连接断开通知*/
function goticeConnectionState(event)
{
	trace("++++++++++ goticeConnectionState for ipc "+this.ipcId+":"+this.iceConnectionState);
	if(this.iceConnectionState == 'disconnected')
	{
		browserPeerConnections[this.ipcId].close();
		delete browserPeerConnections[this.ipcId];
		removeVideoContainer(this.ipcId);
	}
	
}


function handleError(err){
	trace('+++++++++++++++++++++peerconnection handle error:'+err);
}


//********************页面处理函数和websocket事件处理函数**************************************************************************
/*页面初始化函数*/
function init()
{
	//获取页面元素变量
	agentRegBtn = document.getElementById('agentReg');
	refreshIpcListBtn = document.getElementById('refreshIpcList');
	mediaReqBtn = document.getElementById('mediaReq');
	agentQuitBtn = document.getElementById('agentQuit');
	ipclistUl = document.getElementById('ipclist');
	refreshIpcListBtn = document.getElementById('refreshIpcList');
	sidebarDiv = document.getElementById('sidebar');
	videoContent = document.getElementById('content');
	pageState = document.getElementById('pageState');
	
	//确定页面可用状态
	agentRegBtn.disabled = false;
	refreshIpcListBtn.disabled = true;
	mediaReqBtn.disabled = true;
	agentQuitBtn.disabled = true;
	
	//增加元素的事件
	refreshIpcListBtn.addEventListener('click',onRefreshIpcListBtnClick,false);
	mediaReqBtn.onclick = requestMediaFromIpc; 
	agentRegBtn.onclick = agentRegister;
	agentQuitBtn.onclick = agentQuit;
} 

/*窗口关闭事件*/
function closeWindow()
{
	trace('close window!');
	if(wsocket)
	{
		//断开websocket和所有peerconnection
		for (id in browserPeerConnections)
		{
			if(browserPeerConnections[id])
			{
				sendBye2Ipc(id);
				browserPeerConnections[id].close();
				delete browserPeerConnections[id];
			}
		}
		wsocket.close();
		wsocket = null;
	}
}

function onOpen(evt)
{
    updatePageStatus('客户端状态：已连接服务器');
	//发送注册请求
	var agentRegReq = {
		  type:'agentRegReq',
		  agentType:'browser',
		  agentDesc:'webrtc browser'
		};
	postMessage(JSON.stringify(agentRegReq));	
}

function onClose(evt)
{
  alert('webrtc实时浏览客户端与服务器的连接关闭,页面功能不可用！');
  agentQuit();
}

function onMessage(evt)
{
  //trace('message received '+evt.data);
  signal = JSON.parse(evt.data);
   if (signal) {
	 switch(signal.type)
	 {
		 case 'agentRegRes':
		 handleAgentRegRes(signal);
		 break;
		 
		 case 'refreshIpcs':
		 handleRefreshIpcs(signal);
		 break;
		 
		 case 'answer':
		 handleAnswer(signal);
		 break;
		 
		 case 'ipcCandidate':
		 handleIpcCandidate(signal);
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
  //trace('send message:'+msg);
  wsocket.send(msg);
}

function closeMessage()
{
   //trace('socket closed');
   wsocket.close();
}

function updatePageStatus(msg,agantid)
{
   //document.getElementById('pageState').innerHTML = msg;
   if(msg == 'turnoff')
   {
	   pageState.src = 'img/turnoff.png';
	   pageState.title = '未注册';
	   if(textnodeId)
	   {
	     pageState.parentNode.removeChild(textnodeId);
	     textnodeId = null;
	   }
	}
	if(msg == 'turnon')
	{
	   pageState.src = 'img/turnon.png';
	   pageState.title = 'webrtc浏览客户端注册ID:'+agantid;
	   textnodeId = document.createTextNode('注册标示:'+agantid+' ');
	   pageState.parentNode.insertBefore(textnodeId,pageState);
	}
}



window.addEventListener('load',init,false);
window.addEventListener('unload',closeWindow,false);
//window.onunload = closeWindow;
