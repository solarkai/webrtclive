// JavaScript Document

/*构造函数*/
function cashConstruct(initvalue)
{
   this.total = initvalue;
   this.rate = 0.5;
   this.save = function(savevalue)
   {
	   this.total += savevalue;
	};	
	
	this.getRate=function()
	{
	  	return this.rate;
	}
	
	this.setRate = function(newrate)
	{
	   this.rate = newrate;	
	}
	
	this.getMoney = function()
	{
	   return this.total;	
	}
	
}

cashConstruct.prototype.getMoney1 = function()
{
	alert(this.total);
};

var cash = new cashConstruct(1000);
cash.save(129);
cash.getMoney1();

var contentTypeMap = {
    html: "text/html;charset=utf-8",
    1: "text/javascript",
    ".css": "text/css"
};

alert(contentTypeMap["html"]);