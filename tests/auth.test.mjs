import test from 'node:test';
import assert from 'node:assert/strict';
import {configureAuth,canWrite} from '../lib/auth.mjs';
const accounts=[{username:'warehouse',password:'warehouse-test-only',role:'warehouse',displayName:'مسئول انبار'},{username:'project',password:'project-test-only',role:'project_control',displayName:'کنترل پروژه'}];
test('individual accounts keep identity and warehouse/project responsibilities separate',()=>{
 const auth=configureAuth({RAMNOOR_ACCOUNTS_JSON:JSON.stringify(accounts)},'0.0.0.0');
 const who=auth.identify({headers:{authorization:'Basic '+Buffer.from('warehouse:warehouse-test-only').toString('base64')}});assert.equal(who.role,'warehouse');assert.equal(who.individualAccounts,true);assert.equal(who.username,'warehouse');assert.equal(Object.hasOwn(who,'password'),false);
 assert.equal(auth.identify({headers:{authorization:'Basic '+Buffer.from('warehouse:wrong').toString('base64')}}),null);
 assert.equal(canWrite('warehouse','data_response'),true);assert.equal(canWrite('warehouse','data_verify'),false);assert.equal(canWrite('project_control','data_response'),false);assert.equal(canWrite('project_control','data_verify'),true);assert.equal(canWrite('project_control','receipt'),false);assert.equal(canWrite('warehouse','receipt'),true);assert.equal(canWrite('project_control','data_followup','notify'),true);assert.equal(canWrite('warehouse','data_followup','notify'),false);assert.equal(canWrite('warehouse','data_followup','acknowledge'),true);assert.equal(canWrite('admin','data_cancel'),true);
});
test('invalid account settings stop startup rather than silently allow writes',()=>{
 assert.throws(()=>configureAuth({RAMNOOR_ACCOUNTS_JSON:'not-json'},'0.0.0.0'));assert.throws(()=>configureAuth({RAMNOOR_ACCOUNTS_JSON:'[]'},'0.0.0.0'));assert.throws(()=>configureAuth({RAMNOOR_ACCOUNTS_JSON:JSON.stringify([...accounts,accounts[0]])},'0.0.0.0'));assert.throws(()=>configureAuth({RAMNOOR_ACCOUNTS_JSON:JSON.stringify([{...accounts[0],role:'anything'}])},'0.0.0.0'));assert.throws(()=>configureAuth({RAMNOOR_AUTH_USER:'user'},'0.0.0.0'));
 const local=configureAuth({},'127.0.0.1').identify({headers:{}});assert.equal(local.role,'admin');assert.equal(local.individualAccounts,false);
});
