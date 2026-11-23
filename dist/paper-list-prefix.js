// Text list prefixes remain ordinary characters in the saved note. This
// keeps old notes and the existing mark/link offset model fully compatible.
export const LIST_PREFIXES=Object.freeze({bullet:'• ',triangle:'▸ '});
export function applyListPrefix(text,selectionStart,selectionEnd,kind){
 if(typeof text!=='string'||!Object.hasOwn(LIST_PREFIXES,kind))throw Error('สัญลักษณ์รายการไม่ถูกต้อง');
 if(!Number.isInteger(selectionStart)||!Number.isInteger(selectionEnd)||selectionStart<0||selectionStart>selectionEnd||selectionEnd>text.length)throw Error('ตำแหน่งข้อความไม่ถูกต้อง');
 const marker=LIST_PREFIXES[kind],targetEnd=selectionEnd>selectionStart?selectionEnd-1:selectionEnd;
 const starts=[],first=text.lastIndexOf('\n',Math.max(0,selectionStart-1))+1;
 for(let pos=first;pos<=targetEnd;){
  starts.push(pos);
  const lineEnd=text.indexOf('\n',pos);
  if(lineEnd<0||lineEnd>=targetEnd)break;
  pos=lineEnd+1;
 }
 const oldPrefixAt=pos=>text.startsWith(LIST_PREFIXES.bullet,pos)?LIST_PREFIXES.bullet:
  text.startsWith(LIST_PREFIXES.triangle,pos)?LIST_PREFIXES.triangle:'';
 const remove=starts.every(pos=>oldPrefixAt(pos)===marker),operations=[];
 let current=text,start=selectionStart,end=selectionEnd;
 for(const pos of starts.reverse()){
  const oldPrefix=oldPrefixAt(pos);
  const nextPrefix=remove?'':marker;
  const before=current;
  current=current.slice(0,pos)+nextPrefix+current.slice(pos+oldPrefix.length);
  const shift=at=>at<pos?at:at<=pos+oldPrefix.length?pos+nextPrefix.length:at+nextPrefix.length-oldPrefix.length;
  start=shift(start);end=shift(end);
  operations.push({before,after:current});
 }
 return {text:current,start,end,operations};
}
