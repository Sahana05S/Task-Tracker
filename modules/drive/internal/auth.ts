import 'server-only';
import { createSign } from 'node:crypto';
import { DriveFailure,type DrivePolicy } from './contract';

/** Secrets come only from the server environment. Policy and job records contain
 * identifiers, never credentials. No account or scope fallback is allowed. */
export function googleToken(policy:Pick<DrivePolicy,'auth'|'organizationEmail'|'scope'>,env:Readonly<Record<string,string|undefined>>=process.env,fetcher:typeof fetch=fetch):()=>Promise<string>{
 let cached:{token:string;until:number}|null=null;
 return async()=>{
  if(cached&&cached.until>Date.now())return cached.token;
  let body:URLSearchParams;
  if(policy.auth==='shared_drive_service_account'){
   let key:{client_email:string;private_key:string};try{key=JSON.parse(env.TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON??'');}catch{throw new DriveFailure('credentials_missing');}
   if(key.client_email!==policy.organizationEmail||!key.private_key)throw new DriveFailure('configuration_changed');
   const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000);
   const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:key.client_email,scope:'https://www.googleapis.com/auth/'+policy.scope,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
   let signature:string;try{signature=createSign('RSA-SHA256').update(unsigned).sign(key.private_key,'base64url');}catch{throw new DriveFailure('credentials_missing');}
   body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature});
  }else{
   const client_id=env.TASKPULSE_DRIVE_OAUTH_CLIENT_ID,client_secret=env.TASKPULSE_DRIVE_OAUTH_CLIENT_SECRET,refresh_token=env.TASKPULSE_DRIVE_OAUTH_REFRESH_TOKEN;
   if(!client_id||!client_secret||!refresh_token)throw new DriveFailure('credentials_missing');
   body=new URLSearchParams({grant_type:'refresh_token',client_id,client_secret,refresh_token});
  }
  let response:Response;try{response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',body,signal:AbortSignal.timeout(20000)});}catch{throw new DriveFailure('provider_unavailable');}
  if(!response.ok)throw new DriveFailure(response.status===400||response.status===401?'credentials_revoked':'provider_unavailable');
  const value=await response.json();if(typeof value.access_token!=='string'||!value.access_token)throw new DriveFailure('credentials_revoked');
  const scopes=String(value.scope??'').split(' ').filter(s=>s.startsWith('https://www.googleapis.com/auth/drive'));
  if(policy.auth==='organization_oauth'&&(scopes.length!==1||scopes[0]!=='https://www.googleapis.com/auth/'+policy.scope))throw new DriveFailure('access_denied');
  cached={token:value.access_token,until:Date.now()+Math.max(0,Math.min(Number(value.expires_in)||0,3600)-60)*1000};return cached.token;
 };
}
