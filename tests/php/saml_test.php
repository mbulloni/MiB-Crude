<?php
// SAML signature/validation tests: php tests/php/saml_test.php -> prints OK or the failures.
require __DIR__ . '/../../runtime/lib/helpers.php';
require __DIR__ . '/../../runtime/lib/App.php';
require __DIR__ . '/../../runtime/lib/Saml.php';
use MiB\Saml;

function keypair() {
    $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    $csr = openssl_csr_new(['commonName' => 'idp.test'], $key, ['digest_alg' => 'sha256']);
    $crt = openssl_csr_sign($csr, null, $key, 30, ['digest_alg' => 'sha256']);
    openssl_x509_export($crt, $pem);
    return [$key, $pem];
}

function response($key, array $o = []) {
    $now = time();
    $aid = '_a' . bin2hex(random_bytes(8));
    $nb = gmdate('Y-m-d\TH:i:s\Z', $now - 60);
    $na = gmdate('Y-m-d\TH:i:s\Z', $now + ($o['expired'] ?? false ? -3600 : 600));
    $aud = $o['audience'] ?? 'https://sp.test';
    $assertion = '<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="' . $aid . '" Version="2.0" IssueInstant="' . gmdate('Y-m-d\TH:i:s\Z') . '">'
        . '<saml:Issuer>https://idp.test</saml:Issuer><saml:Subject><saml:NameID>mario.rossi</saml:NameID></saml:Subject>'
        . '<saml:Conditions NotBefore="' . $nb . '" NotOnOrAfter="' . $na . '"><saml:AudienceRestriction><saml:Audience>' . $aud . '</saml:Audience></saml:AudienceRestriction></saml:Conditions>'
        . '<saml:AttributeStatement><saml:Attribute Name="mail"><saml:AttributeValue>mario@test.it</saml:AttributeValue></saml:Attribute>'
        . '<saml:Attribute Name="groups"><saml:AttributeValue>Vendite</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion>';
    $doc = new DOMDocument();
    $doc->loadXML('<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_r1" Version="2.0" InResponseTo="_req1" Destination="https://sp.test/acs"><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>' . $assertion . '</samlp:Response>');
    $a = $doc->getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:assertion', 'Assertion')->item(0);
    $digest = base64_encode(hash('sha256', $a->C14N(true, false), true));
    $ds = 'http://www.w3.org/2000/09/xmldsig#';
    $sig = $doc->createElementNS($ds, 'ds:Signature');
    $si = $doc->createElementNS($ds, 'ds:SignedInfo');
    $sig->appendChild($si);
    $cm = $doc->createElementNS($ds, 'ds:CanonicalizationMethod'); $cm->setAttribute('Algorithm', 'http://www.w3.org/2001/10/xml-exc-c14n#'); $si->appendChild($cm);
    $sm = $doc->createElementNS($ds, 'ds:SignatureMethod'); $sm->setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'); $si->appendChild($sm);
    $ref = $doc->createElementNS($ds, 'ds:Reference'); $ref->setAttribute('URI', '#' . $aid); $si->appendChild($ref);
    $trs = $doc->createElementNS($ds, 'ds:Transforms'); $ref->appendChild($trs);
    foreach (['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'] as $alg) { $tr = $doc->createElementNS($ds, 'ds:Transform'); $tr->setAttribute('Algorithm', $alg); $trs->appendChild($tr); }
    $dm = $doc->createElementNS($ds, 'ds:DigestMethod'); $dm->setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256'); $ref->appendChild($dm);
    $ref->appendChild($doc->createElementNS($ds, 'ds:DigestValue', $digest));
    $issuer = $a->getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:assertion', 'Issuer')->item(0);
    $a->insertBefore($sig, $issuer->nextSibling);
    openssl_sign($si->C14N(true, false), $value, $key, OPENSSL_ALGO_SHA256);
    $sig->appendChild($doc->createElementNS($ds, 'ds:SignatureValue', base64_encode($value)));
    if (!empty($o['tamper'])) $doc->getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:assertion', 'NameID')->item(0)->nodeValue = 'admin';
    if (!empty($o['wrap'])) {
        $evil = $a->cloneNode(true);
        $evil->setAttribute('ID', '_evil');
        $evil->getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:assertion', 'NameID')->item(0)->nodeValue = 'admin';
        $doc->documentElement->insertBefore($evil, $a);
    }
    return base64_encode($doc->saveXML());
}

list($key, $cert) = keypair();
list($key2, $cert2) = keypair();
$cfg = ['idpCert' => $cert, 'idpEntityId' => 'https://idp.test', 'spEntityId' => 'https://sp.test', 'emailAttr' => 'mail', 'groupAttr' => 'groups', 'groupMap' => ['Vendite' => 'users']];
$fail = [];
$expectOk = function ($name, $b64, $c) use (&$fail) {
    try { list($u, $i) = Saml::processResponse($b64, $c, '_req1', 'https://sp.test/acs'); if ($u !== 'mario.rossi' || $i['email'] !== 'mario@test.it' || $i['groups'] !== ['Vendite']) $fail[] = "$name: dati errati"; }
    catch (Throwable $e) { $fail[] = "$name: " . $e->getMessage(); }
};
$expectFail = function ($name, $b64, $c, $req = '_req1') use (&$fail) {
    try { Saml::processResponse($b64, $c, $req, 'https://sp.test/acs'); $fail[] = "$name: accettata"; } catch (Throwable $e) { /* expected */ }
};
$expectOk('valida', response($key), $cfg);
$expectFail('manomessa', response($key, ['tamper' => true]), $cfg);
$expectFail('wrapping', response($key, ['wrap' => true]), $cfg);
$expectFail('scaduta', response($key, ['expired' => true]), $cfg);
$expectFail('audience', response($key, ['audience' => 'https://altro.sp']), $cfg);
$expectFail('altro certificato', response($key2), $cfg);
$expectFail('InResponseTo', response($key), $cfg, '_altra');
$expectFail('non firmata', base64_encode(preg_replace('#<ds:Signature.*</ds:Signature>#s', '', base64_decode(response($key)))), $cfg);
echo $fail ? implode("\n", $fail) . "\n" : "OK\n";
