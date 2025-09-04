import * as React from "react";
export function Alert(props: React.HTMLAttributes<HTMLDivElement>){ return <div role="alert" {...props} /> }
export function AlertTitle(props: React.HTMLAttributes<HTMLHeadingElement>){ return <h5 {...props} /> }
export function AlertDescription(props: React.HTMLAttributes<HTMLDivElement>){ return <div {...props} /> }
export default Alert;
