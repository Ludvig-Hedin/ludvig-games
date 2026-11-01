import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const helper = '/Users/ludvighedin/Programming/agent-dotfiles/home/.local/lib/agent-runtime/games-withdrawal-free.py';
const setup = `
import json, pathlib, tempfile, types, time
module = types.ModuleType('withdrawal_deploy_candidate')
exec(compile(pathlib.Path(${JSON.stringify(helper)}).read_bytes(), ${JSON.stringify(helper)}, 'exec'), module.__dict__)
def rejected(action):
    try: action()
    except ValueError: return
    raise AssertionError('expected a closed rejection')
`;
function python(code) {
  const result = spawnSync('/usr/bin/python3', ['-I', '-B', '-c', setup + code], {
    encoding: 'utf8', timeout: 10000, env: { PATH: '/usr/bin:/bin', HOME: '/Users/ludvighedin' },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

test('withdrawal deployment refuses arbitrary operations before reading credentials or contacting providers', () => {
  python(`
for operation in ('deploy', 'upgrade-plan', 'publish-products', 'set-secret', '/bin/sh'):
    rejected(lambda: module.run(operation))
for method, kind in [('DELETE','kv'), ('PUT','turnstile'), ('POST','email')]:
    rejected(lambda: module.resource_api(None, method, kind))
rejected(lambda: module.resource_api(None, 'POST', 'kv', {'title':'another-project'}))
rejected(lambda: module.resource_api(None, 'GET', 'turnstile', site_key='../other'))
`);
});

test('withdrawal deployment constructs only the reviewed disabled service and public asset directory', () => {
  python(`
core = types.SimpleNamespace(regular=lambda path, **kwargs: path.stat())
value = {'namespaceId':'a'*32,'siteKey':'0xExamplePublicSiteKey'}
with tempfile.TemporaryDirectory() as directory:
    scratch = pathlib.Path(directory)
    config = json.loads(module.configuration(core, scratch, value).read_text())
    assert config['name'] == 'ludvig-games-withdrawals'
    assert config['account_id'] == 'cffb5d1b12c3302ecc0745862fbf1f14'
    assert config['vars']['WITHDRAWAL_ENABLED'] == 'false'
    assert set(config['vars']) == {'WITHDRAWAL_ENABLED','TURNSTILE_SITE_KEY'}
    assert config['kv_namespaces'] == [{'binding':'RECOVERY','id':'a'*32}]
    assert config['assets']['directory'] == './client'
    assert config['preview_urls'] is False and config['observability']['enabled'] is False
    assert not (scratch/'client/worker.mjs').exists()
    assert (scratch/'worker.mjs').is_file()
    module.SOURCE_HASHES['worker.mjs'] = '0'*64
    rejected(lambda: module.configuration(core, scratch, value))
`);
});

test('withdrawal activation requires a fresh complete version-bound prerequisite acceptance', () => {
  python(`
version = '12345678-1234-1234-1234-123456789012'
resources = {'accountId':module.ACCOUNT,'worker':module.SCRIPT,'namespaceId':'a'*32,'siteKey':'0xExamplePublicSiteKey'}
data = {'accountId':module.ACCOUNT,'worker':module.SCRIPT,'versionId':version,
        'sourceHashes':module.SOURCE_HASHES,'resources':resources,
        'checks':{key:True for key in module.ACCEPTED_CHECKS},
        'evidence':{key:'private checked evidence reference' for key in module.ACCEPTED_CHECKS},
        'acceptedAt':int(time.time())}
module.read_private = lambda *args, **kwargs: json.dumps(data).encode()
module.acceptance(None, resources, version)
data['checks']['receivingRoleResolved'] = False
rejected(lambda: module.acceptance(None, resources, version))
data['checks']['receivingRoleResolved'] = True
data['versionId'] = '87654321-1234-1234-1234-123456789012'
rejected(lambda: module.acceptance(None, resources, version))
data['versionId'] = version
data['acceptedAt'] = int(time.time()) - 86401
rejected(lambda: module.acceptance(None, resources, version))
data['acceptedAt'] = int(time.time())
data['evidence'].pop('ownerControlledMailDelivery')
rejected(lambda: module.acceptance(None, resources, version))
`);
});

test('resource provisioning rejects incomplete listings and never guesses namespace ownership', () => {
  python(`
assert module.complete_list({'result':[],'result_info':{'page':1,'count':0,'total_count':0}}) == []
for value in ({'result':[]}, {'result':[],'result_info':{'page':1,'count':0,'total_count':1}},
              {'result':[],'result_info':{'page':2,'count':0,'total_count':0}}):
    rejected(lambda: module.complete_list(value))
`);
});

test('closed redeployment preserves its original version check before any write', () => {
  python(`
with tempfile.TemporaryDirectory() as directory:
    core=types.SimpleNamespace(regular=lambda *a,**k:None, NODE=pathlib.Path('/usr/bin/true'),
        WRANGLER=pathlib.Path('/usr/bin/true'), AUTH=pathlib.Path(directory))
    module.load_core=lambda:core
    module.registered=lambda *a:None
    module.proof=lambda *a:None
    module.resources=lambda *a:{'namespaceId':'a'*32,'siteKey':'example-site-key'}
    module.verify_resources=lambda *a,**k:None
    module.verify_existing=lambda *a,**k:{'WITHDRAWAL_ENABLED':{}}
    module.deployment_receipt=lambda *a,**k:{'versionId':'12345678-1234-1234-1234-123456789012'}
    module.configuration=lambda *a,**k:pathlib.Path(directory)/'config.json'
    module.active_version=lambda *a:'87654321-1234-1234-1234-123456789012'
    module.subprocess.run=lambda *a,**k:(_ for _ in ()).throw(AssertionError('must not deploy changed version'))
    rejected(lambda:module.run('deploy-closed'))
`);
});

test('private recovery probe checks list and original value, then removes only its synthetic fixture', () => {
  python(`
module.verify_resources=lambda *a,**k:None
module.deployment_receipt=lambda *a,**k:{'versionId':'12345678-1234-1234-1234-123456789012'}
module.active_version=lambda *a:'12345678-1234-1234-1234-123456789012'
module.registered=lambda *a:None
module.proof=lambda *a:None
value={'namespaceId':'a'*32}
module.resources=lambda *a:value
saved=[]
module.save_private=lambda *a,**k:saved.append(a[-1])
for failure in (None,'read','write'):
    state={}; actions=[]
    def request(core,value,action):
        actions.append(action)
        if action=='absent':return not state
        if action=='write':
            state['body']=module.PROBE_BODY
            if failure=='write':raise ValueError('ambiguous write')
            return {'success':True}
        if action=='list':return {'result':[{'name':module.PROBE_KEY}],'result_info':{'cursor':''}}
        if action=='read':return b'wrong' if failure=='read' else state['body']
        if action=='delete':state.clear();return {'success':True}
    module.recovery_probe_request=request
    if failure:rejected(lambda:module.probe_recovery(None,value))
    else:module.probe_recovery(None,value)
    assert not state and 'delete' in actions
assert len(saved)==1 and saved[0]['deleted'] is True
`);
});
