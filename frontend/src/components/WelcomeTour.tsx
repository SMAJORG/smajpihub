import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import { useAuthContext } from "../contexts/AuthContext";
import { TUTORIAL_OPEN_EVENT, tutorialById, tutorialStorageKey, type TutorialDefinition } from "../content/tutorials";

const WELCOME_STORAGE_KEY="smaj_welcome_seen";
const WELCOME_REPLAY_EVENT="smaj:welcome-tour-open";
const GAP=12;
const ACTIVE_TOUR_KEY="smaj_active_tutorial";
type Box={top:number;left:number;width:number;height:number;right:number;bottom:number};
const visibleTarget=(selector?:string)=>selector ? [...document.querySelectorAll<HTMLElement>(selector)].find(el=>{const r=el.getBoundingClientRect();return r.width>1&&r.height>1}) : undefined;
const iconFor=(icon:string)=> icon==="home"?<HomeOutlinedIcon/>:icon==="services"?<AppsOutlinedIcon/>:icon==="search"?<SearchOutlinedIcon/>:icon==="messages"?<ChatOutlinedIcon/>:icon==="profile"?<PersonOutlineIcon/>:icon==="done"?<CheckCircleOutlineIcon/>:<LightbulbOutlinedIcon/>;

const WelcomeTour=()=>{
 const {user,isAuthenticated,isLoading}=useAuthContext(); const navigate=useNavigate(); const location=useLocation();
 const [tutorial,setTutorial]=useState<TutorialDefinition|null>(null); const [index,setIndex]=useState(0); const [box,setBox]=useState<Box|null>(null); const [card,setCard]=useState({top:0,left:0,ready:false}); const cardRef=useRef<HTMLElement>(null);
 const userKey=user?.uid||user?.piUsername||user?.username; const oldKey=useMemo(()=>userKey?`${WELCOME_STORAGE_KEY}:${userKey}`:WELCOME_STORAGE_KEY,[userKey]); const step=tutorial?.steps[index];
 const markComplete=useCallback((current:TutorialDefinition|null)=>{if(!current)return;localStorage.setItem(tutorialStorageKey(userKey,current.id),"true");if(current.id==="main-tour")localStorage.setItem(oldKey,"true");},[oldKey,userKey]);
 const close=useCallback((complete=true)=>{if(complete)markComplete(tutorial);sessionStorage.removeItem(ACTIVE_TOUR_KEY);setTutorial(null);setIndex(0);setBox(null);},[markComplete,tutorial]);
 const start=useCallback((id:string)=>{const found=tutorialById(id);if(!found)return;sessionStorage.setItem(ACTIVE_TOUR_KEY,JSON.stringify({id,index:0}));setTutorial(found);setIndex(0);if(location.pathname!==found.steps[0].route)navigate(found.steps[0].route);},[location.pathname,navigate]);
 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(ACTIVE_TOUR_KEY)||"null") as {id?:string;index?:number}|null;const found=saved?.id?tutorialById(saved.id):undefined;if(found){setTutorial(found);setIndex(Math.min(saved?.index||0,found.steps.length-1));}}catch{sessionStorage.removeItem(ACTIVE_TOUR_KEY)}},[]);
 useEffect(()=>{const replay=()=>start("main-tour");const open=(e:Event)=>start((e as CustomEvent<{id?:string}>).detail?.id||"main-tour");window.addEventListener(WELCOME_REPLAY_EVENT,replay);window.addEventListener(TUTORIAL_OPEN_EVENT,open);return()=>{window.removeEventListener(WELCOME_REPLAY_EVENT,replay);window.removeEventListener(TUTORIAL_OPEN_EVENT,open)}},[start]);
 useEffect(()=>{if(!isAuthenticated||isLoading||!user)return;if(localStorage.getItem(oldKey)==="true"||localStorage.getItem(tutorialStorageKey(userKey,"main-tour"))==="true")return;const timer=setTimeout(()=>start("main-tour"),650);return()=>clearTimeout(timer)},[isAuthenticated,isLoading,oldKey,start,user,userKey]);
 useEffect(()=>{if(!step)return;if(location.pathname!==step.route)navigate(step.route);},[location.pathname,navigate,step]);
 const measure=useCallback(()=>{if(!step?.target){setBox(null);return}const element=visibleTarget(step.target);if(!element){setBox(null);return}const r=element.getBoundingClientRect(),pad=7;setBox({top:Math.max(6,r.top-pad),left:Math.max(6,r.left-pad),width:Math.min(innerWidth-12,r.width+pad*2),height:Math.min(innerHeight-12,r.height+pad*2),right:Math.min(innerWidth-6,r.right+pad),bottom:Math.min(innerHeight-6,r.bottom+pad)});},[step]);
 useEffect(()=>{if(!tutorial)return;setCard(c=>({...c,ready:false}));const timer=setTimeout(measure,180);addEventListener("resize",measure);addEventListener("orientationchange",measure);addEventListener("scroll",measure,true);return()=>{clearTimeout(timer);removeEventListener("resize",measure);removeEventListener("orientationchange",measure);removeEventListener("scroll",measure,true)}},[index,measure,tutorial,location.pathname]);
 useLayoutEffect(()=>{if(!tutorial||!cardRef.current)return;const r=cardRef.current.getBoundingClientRect(),margin=12,safeBottom=20;let top=(innerHeight-r.height)/2,left=(innerWidth-r.width)/2;if(box){const preferred=step?.position||"bottom";if(preferred==="top")top=box.top-r.height-GAP;else if(preferred==="left")left=box.left-r.width-GAP;else if(preferred==="right")left=box.right+GAP;else top=box.bottom+GAP;if((preferred==="top"||preferred==="bottom")){left=box.left+box.width/2-r.width/2;if(top<margin)top=box.bottom+GAP;if(top+r.height>innerHeight-safeBottom)top=box.top-r.height-GAP}else{top=box.top+box.height/2-r.height/2;if(left<margin)left=box.right+GAP;if(left+r.width>innerWidth-margin)left=box.left-r.width-GAP}}setCard({top:Math.max(margin,Math.min(top,innerHeight-r.height-safeBottom)),left:Math.max(margin,Math.min(left,innerWidth-r.width-margin)),ready:true});},[box,index,step,tutorial]);
 const previous=useCallback(()=>setIndex(i=>{const nextIndex=Math.max(0,i-1);if(tutorial)sessionStorage.setItem(ACTIVE_TOUR_KEY,JSON.stringify({id:tutorial.id,index:nextIndex}));return nextIndex}),[tutorial]);const next=()=>{if(!tutorial)return;if(index===tutorial.steps.length-1){close();return}const nextIndex=index+1;sessionStorage.setItem(ACTIVE_TOUR_KEY,JSON.stringify({id:tutorial.id,index:nextIndex}));setIndex(nextIndex);const route=tutorial.steps[nextIndex].route;if(location.pathname!==route)navigate(route)};
 useEffect(()=>{if(!tutorial)return;const key=(e:KeyboardEvent)=>{if(e.key==="Escape")close()};addEventListener("keydown",key);const listener=CapacitorApp.addListener("backButton",()=>index>0?previous():close(false));return()=>{removeEventListener("keydown",key);void listener.then(h=>h.remove())}},[close,index,previous,tutorial]);
 if(!tutorial||!step)return null;
 return <div className="guided-tour-root" role="dialog" aria-modal="true" aria-labelledby="guided-tour-title">
   {box?<><div className="guided-tour-mask top" style={{height:box.top}}/><div className="guided-tour-mask left" style={{top:box.top,left:0,width:box.left,height:box.height}}/><div className="guided-tour-mask right" style={{top:box.top,left:box.right,right:0,height:box.height}}/><div className="guided-tour-mask bottom" style={{top:box.bottom,bottom:0}}/><div className="guided-tour-highlight" style={{top:box.top,left:box.left,width:box.width,height:box.height}}/></>:<div className="guided-tour-mask full"/>}
   <section ref={cardRef} className="guided-tour-card" style={{top:card.top,left:card.left,visibility:card.ready?"visible":"hidden"}}>
    <div className="guided-tour-heading"><span>{iconFor(step.icon)}</span><small>{index+1} of {tutorial.steps.length}</small></div><h2 id="guided-tour-title">{step.title}</h2><p>{step.description}</p>
    <div className="guided-tour-progress">{tutorial.steps.map((s,i)=><i key={s.id} className={i<=index?"active":""}/>)}</div>
    <div className="guided-tour-actions"><button type="button" className="skip" onClick={()=>close()}>Skip</button>{index>0?<button type="button" onClick={previous}>Back</button>:null}<button type="button" className="next" onClick={next}>{index===tutorial.steps.length-1?"Done":"Next"}</button></div>
   </section>
 </div>
};
export { WELCOME_REPLAY_EVENT }; export default WelcomeTour;
