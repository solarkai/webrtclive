var fs = require("fs");
var http = require("http");
var path = require("path");
var indexpage = "webrtcBrowserIndex.html";


var websocket = require("websocket").server;
//全局变量
var serverDir = path.dirname(__filename)
var clientDir = path.join(serverDir, "client/");

var port = 80;
var browsers = {}; //浏览器的连接数组
var ipcs = {}; //ipc的连接数组
//var webrtc_discussions = {};
var browserIndex = 1; //浏览器的ID索引
var ipcIndex = 1; //IPC的ID索引

var contentTypeMap = {
    ".html": "text/html;charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css"
};

//http 服务器功能
var http_server = http.createServer(function(request, response) {
	/*response.write(page);
	response.end();*/
	var url = request.url.split("?", 1)[0];
	console.log("get request url:" + request.url+" and request file is: "+url);
	
    var filePath = path.join(clientDir, url);
    if (filePath.indexOf(clientDir) != 0 || filePath == clientDir)
        filePath = path.join(clientDir, "/"+indexpage);

    fs.stat(filePath, function (err, stats) {
        if (err || !stats.isFile()) {
            response.writeHead(404);
            response.end("404 Not found");
            return;
        }
        log_comment("load index path: "+filePath);
		
        var contentType = contentTypeMap[path.extname(filePath)] || "text/plain";
        response.writeHead(200, { "Content-Type": contentType });

        var readStream = fs.createReadStream(filePath);
        readStream.on("error", function () {
            response.writeHead(500);
            response.end("500 Server error");
        });
        readStream.pipe(response);
    });
});

http_server.listen(port, function() {
	log_comment("server listening (port "+port+")");
});


function log_comment(info)
{
	console.log(info);
}

//websocket功能
var websocket_server = new websocket({
	httpServer: http_server
});

log_comment("websocket_server created at port :"+ port);

websocket_server.on("request", function(request) {
					  log_comment("new request ("+request.origin+")");
					  var connection = request.accept(null, request.origin);
					  log_comment("new connection ("+connection.remoteAddress+")");
					  //webrtc_clients.push(connection);
					  //connection.id = webrtc_clients.length-1;
					  connection.on("message",  
						  //信令消息处理
						  function (message)
						  {
									if (message.type === "utf8") {
										   log_comment("got message "+message.utf8Data);
										   var signal = undefined;
										   try { 
												signal = JSON.parse(message.utf8Data); 
										   } catch(e) 
										   { 
										       log_comment("JSON parse sig fail: "+message.utf8Data);
										   };
										   if (signal) {
											   switch(signal.type)
											   {
												   case 'agentRegReq':
												   handleAgentRegReq(connection,signal);
												   break;
												   
												   case 'ipcRefreshReq':
												   handleIpcRefreshReq(connection,signal);
												   break;
												   
												   case 'offer':
												   handleOffer(connection,signal);
												   break;
												   
												   case 'ipcCandidate':
												   handleIpcCandidate(connection,signal);
												   break;
												   
												   case 'answer':
												   handleAnswer(connection,signal);
												   break;
												   
												   case 'browserCandidate':
												   handleBrowserCandidate(connection,signal);
												   break;
												   
												   case 'bye':
												   handleBye(connection,signal);
												   break;
												   
												   default:
												   log_comment("undefined signal: "+message.utf8Data);
												   break;
												   
												}
										  } else {
											 log_comment("invalid signal: "+message.utf8Data);
											 //connection.send("invalid signal: "+message.utf8Data);
										  }//end if (signal)
									}//end if (message.type === "utf8")
									else
									{
									  log_comment("unknown message type received: "+message.type);	
									}
						  }
					  );//end connection.on("message" 
					  connection.on("close",
					      //处理套接字关闭
						  function()
						  {
							  if(connection.id)
							  {
								 if(connection.agentType == 'browser')
								 {
									 delete browsers[connection.id];
								 }
								 if(connection.agentType == 'ipc')
								 {
									 delete ipcs[connection.id];
									 refreshIpcs();
								 }
								 log_comment("close websocket: "+connection.agentType+" "+connection.id);
							  }
						  }
					 );
					
                    }
                 );


/*处理agent注册请求*/
function handleAgentRegReq(conn,sig)
{
	var agentRegRes;
	conn.agentType = sig.agentType;
	conn.agentDesc = sig.agentDesc;
	if(sig.agentType == 'browser')
	{
		conn.id = browserIndex;
		browsers[browserIndex] = conn;
		agentRegRes = {
			 type:'agentRegRes',
             agentId: browserIndex,
             errorCode:0,
             errorDest:''
			}
		conn.send(JSON.stringify(agentRegRes));	//发送注册回应
		browserIndex++;
		conn.send(JSON.stringify(getIpcs())); //发送服务器端的ipc列表信息
	}else if(sig.agentType == 'ipc')
	{
		conn.id = ipcIndex;
		ipcs[ipcIndex] = conn;
		agentRegRes = {
			 type:'agentRegRes',
             agentId: ipcIndex,
             errorCode:0,
             errorDest:''
			}
		conn.send(JSON.stringify(agentRegRes));
		ipcIndex++;
		refreshIpcs(); //向各注册的browser发送IPC更新信息		
	}else
	{
	 log_comment("unknown agentType for agentRegReq: "+sig.agentType);
	}
}

/*处理刷新IPC列表请求*/
function handleIpcRefreshReq(conn,sig)
{
	conn.send(JSON.stringify(getIpcs())); //发送服务器端的ipc列表信息
}

/*处理浏览器向IPC的offer请求*/
function handleOffer(conn,sig)
{
	if((sig.ipcId)&&(ipcs[sig.ipcId]))
    {
	  ipcs[sig.ipcId].send(JSON.stringify(sig));
	}else
	{
	  log_comment("send offer to "+sig.ipcId+" fail!");
	}
	
}

/*处理IPC向浏览器的IpcCandidate的消息*/
function handleIpcCandidate(conn,sig)
{
   	if((sig.browserId)&&(browsers[sig.browserId]))
    {
	  browsers[sig.browserId].send(JSON.stringify(sig));
	}else
	{
	  log_comment("send IpcCandidate to "+sig.browserId+" fail!");
	}
}

/*处理浏览器向IPC的answer消息*/
function handleAnswer(conn,sig)
{
	
	if((sig.browserId)&&(browsers[sig.browserId]))
    {
	  browsers[sig.browserId].send(JSON.stringify(sig));
	}else
	{
	  log_comment("send answer to "+sig.browserId+" fail!");
	}
}

/*处理浏览器向IPC的iceCandidate消息*/
function handleBrowserCandidate(conn,sig)
{
	if((sig.ipcId)&&(ipcs[sig.ipcId]))
    {
	  ipcs[sig.ipcId].send(JSON.stringify(sig));
	}else
	{
	  log_comment("send BrowserCandidate to "+sig.ipcId+" fail!");
	}
}

/*处理浏览器向IPC的bye消息*/
function handleBye(conn,sig)
{
	if((sig.ipcId)&&(ipcs[sig.ipcId]))
    {
	  ipcs[sig.ipcId].send(JSON.stringify(sig));
	}else
	{
	  log_comment("send bye to "+sig.ipcId+" fail!");
	}
}

//向各注册的browser发送IPC更新信息
function refreshIpcs()
{
	var ipcs = getIpcs();
	for(id in browsers)
	{
		var conn = browsers[id];
		conn.send(JSON.stringify(ipcs));
	}
}

/*将当前的ipc列表构建成信令对象*/
function getIpcs()
{
	var ipcsArray = [];
	for(id in ipcs)
	{
	   var conn = ipcs[id];
	   var ipc = {
		           ipcId:conn.id,
				   ipcDesc:conn.agentDesc
		         };
	   ipcsArray.push(ipc); 
	}
	var refreshIpcs = {
		 type:"refreshIpcs",
		 ipcArray:ipcsArray
		};
	return refreshIpcs;	
}


