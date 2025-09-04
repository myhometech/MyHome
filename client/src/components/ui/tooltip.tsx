import * as React from "react";
export function TooltipProvider({children}:{children:React.ReactNode}){ return <>{children}</> }
export function Tooltip(props:any){ return <span {...props} /> }
export function TooltipTrigger(props:any){ return <span {...props} /> }
export function TooltipContent(props:any){ return <span {...props} /> }
export default Tooltip;
