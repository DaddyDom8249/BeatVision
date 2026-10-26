import jpeg from 'npm:jpeg-js@0.4.4';
import { PNG } from 'npm:pngjs@7.0.0';
import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';

export function validateImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('SCENE_IMAGE_SIZE_INVALID');
  const dimensions = (width: number, height: number) => {
    if (!(width > 0 && height > 0) || width * height > 4_200_000) throw new Error('SCENE_IMAGE_DIMENSIONS_UNSUPPORTED');
  };
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      if (bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error('truncated JPEG');
      const decoded = jpeg.decode(bytes, {useTArray:true,formatAsRGBA:true,maxResolutionInMP:4.2,maxMemoryUsageInMB:64,tolerantDecoding:false});
      dimensions(decoded.width,decoded.height);
      if (decoded.data.length !== decoded.width * decoded.height * 4) throw new Error('invalid pixels');
      return {contentType:'image/jpeg',extension:'jpg',width:decoded.width,height:decoded.height};
    }
    if ([137,80,78,71,13,10,26,10].every((value,index) => bytes[index]===value)) {
      if (bytes.length < 33) throw new Error('truncated PNG');
      const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      const width=view.getUint32(16),height=view.getUint32(20); dimensions(width,height);
      const chunks: Uint8Array[] = []; let ended=false;
      for (let offset=8;offset<bytes.length;) {
        if (offset+12>bytes.length) throw new Error('truncated chunk');
        const length=view.getUint32(offset); if(offset+length+12>bytes.length) throw new Error('invalid chunk');
        const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
        if(type==='IDAT') chunks.push(bytes.subarray(offset+8,offset+8+length));
        offset+=length+12;
        if(type==='IEND'){ended=length===0 && offset===bytes.length;break;}
      }
      if(!ended || !chunks.length) throw new Error('missing PNG data');
      // Bound inflate before the PNG decoder; also permits 16-bit/interlaced source rows.
      inflateSync(Buffer.concat(chunks),{maxOutputLength:width*height*8+height*8+1024});
      const decoded=PNG.sync.read(Buffer.from(bytes),{checkCRC:true});
      if(decoded.width!==width || decoded.height!==height || decoded.data.length!==width*height*4) throw new Error('invalid pixels');
      return {contentType:'image/png',extension:'png',width,height};
    }
  } catch { throw new Error('SCENE_IMAGE_DECODE_FAILED'); }
  throw new Error('SCENE_IMAGE_NOT_IMAGE');
}


export async function readImage(url: string, request: typeof fetch = fetch) {
  const response = await request(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok || !response.body) throw new Error('SCENE_IMAGE_DOWNLOAD_FAILED');
  const limit=8*1024*1024;
  if(Number(response.headers.get('content-length')||0)>limit) throw new Error('SCENE_IMAGE_SIZE_INVALID');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>limit)throw new Error('SCENE_IMAGE_SIZE_INVALID');chunks.push(item.value);}}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return validateImage(bytes);
}
