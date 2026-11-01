import { useEffect, useRef, useState } from "react";
import { useAuthContext } from "../contexts/AuthContext";
import LoginWithPiButton from "../components/LoginWithPiButton";
import { axiosClient } from "../lib/axiosClient";

export default function AiSignInPage() {
  const {isAuthenticated,isLoading}=useAuthContext();
  const [error,setError]=useState("");
  const started=useRef(false);
  const params=new URLSearchParams(window.location.search);
  const values=Object.fromEntries(["client_id","redirect_uri","state","scope"].map(name=>[name,params.get(name)||""]));
  useEffect(()=>{
    if(!isAuthenticated) window.sessionStorage.setItem("smaj_post_auth_redirect", window.location.pathname + window.location.search);
    if(!isAuthenticated||isLoading||started.current)return;
    started.current=true;
    axiosClient.post("/sso/authorize",values,{withCredentials:true}).then(({data})=>{
      const destination=new URL(data.redirectUrl);
      const registered=new URL(values.redirect_uri);
      if(destination.origin!==registered.origin||destination.pathname!==registered.pathname||destination.protocol!=="https:"||destination.searchParams.get("state")!==values.state)throw new Error("Invalid sign-in response");
      window.location.assign(destination.toString());
    }).catch(()=>setError("Sign-in could not be completed. Return to SMAJ AI and approve the search again."));
  },[isAuthenticated,isLoading]);
  return <main className="private-page"><section className="private-page-heading"><h1>Continue to SMAJ AI</h1><p>Sign in with Pi to continue your approved search. No purchase or application will be made.</p>{isLoading?<p role="status">Checking your session…</p>:!isAuthenticated?<LoginWithPiButton>Sign in with Pi</LoginWithPiButton>:!error&&<p role="status">Returning to your search…</p>}{error&&<p role="alert">{error}</p>}</section></main>;
}
