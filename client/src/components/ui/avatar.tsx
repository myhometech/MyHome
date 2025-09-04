import * as React from "react";
export function Avatar(props:any){ return <div {...props} /> }
export function AvatarImage(props: React.ImgHTMLAttributes<HTMLImageElement>){ return <img {...props} /> }
export function AvatarFallback(props:any){ return <div {...props} /> }
export default Avatar;
