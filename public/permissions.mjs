export const roleTitles={admin:'مدیر',warehouse:'انبار',project_control:'کنترل پروژه'};
export function canWrite(role,kind,followupType){
 if(role==='admin')return true;
 if(['data_request','data_verify','data_cancel'].includes(kind))return role==='project_control';
 if(kind==='data_response')return role==='warehouse';
 if(kind==='data_followup')return followupType==='notify'?role==='project_control':followupType==='acknowledge'?role==='warehouse':['project_control','warehouse'].includes(role);
 if(['reserve','release'].includes(kind))return ['project_control','warehouse'].includes(role);
 return role==='warehouse'&&['receipt','issue','return','transfer','correct'].includes(kind);
}
