import type { CSSProperties } from 'react';

export function MoveIcon({move, className='', style}: {move:number; className?:string; style?:CSSProperties}) {
  return <svg className={className} style={style} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    {move===0 ? <><path d="m13 42-3-15 12-16 19 1 13 14-3 20-17 8-16-4Z" fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeWidth="2"/><path d="m10 27 17 1 7 26m-7-26 14-16m-14 16 16 10 11-12M13 42l14-14m16 10 8 8" stroke="currentColor" strokeWidth="1.5" opacity=".6"/></>
      : move===1 ? <><path d="M15 9h25l11 12v34H15Z" fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M40 9v13h11M24 32h18M24 39h18M24 46h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M10 18H8v38a3 3 0 0 0 3 3h31" stroke="currentColor" strokeWidth="2" opacity=".45"/></>
      : <><path d="m27 36 20-26 3 2-14 29M36 36 17 10l-3 2 13 29" fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><circle cx="22" cy="46" r="9" stroke="currentColor" strokeWidth="3"/><circle cx="43" cy="46" r="9" stroke="currentColor" strokeWidth="3"/><circle cx="32" cy="32" r="2.5" fill="currentColor"/></>}
  </svg>;
}

export function Icon({name,size=20}: {name:string;size?:number}) {
  const paths:Record<string,React.ReactNode> = {
    arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,
    help:<><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></>,
    back:<path d="M19 12H5m6-6-6 6 6 6"/>,
    close:<path d="m6 6 12 12M6 18 18 6"/>,
    sound:<><path d="m11 4-6 5H2v6h3l6 5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    mute:<><path d="m11 4-6 5H2v6h3l6 5Z"/><path d="m16 9 6 6m0-6-6 6"/></>,
    settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></>,
    people:<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/></>,
    local:<><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5M8 8h2m-1-1v2m6-1h.01m2 3h.01"/></>,
    bot:<><rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 7V3m-4 9h.01M16 12h.01M9 16h6M1 11v5m22-5v5"/></>,
    copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
    check:<path d="m5 12 4 4L19 6"/>,
    shield:<><path d="m12 3 8 3v6c0 4-3 7-8 10-5-3-8-6-8-10V6Z"/><path d="m8 12 3 3 5-6"/></>,
    bolt:<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>,
    trophy:<><path d="M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 15v6m-5 0h10"/></>,
    refresh:<><path d="M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5M4 14a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/></>,
    chevron:<path d="m8 10 4 4 4-4"/>,
    lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></>,
    spark:<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z"/>,
    history:<><path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.spark}</svg>;
}
