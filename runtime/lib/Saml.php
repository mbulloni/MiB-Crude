<?php
namespace MiB;

/**
 * SAML 2.0 Service Provider: SP-initiated login (HTTP-Redirect AuthnRequest, HTTP-POST Response).
 * The signature of the Response or of the Assertion is verified with the IdP certificate
 * (enveloped signature, exclusive C14N, RSA-SHA256/SHA1) and the data is read only from the
 * element that the signature covers, to resist signature-wrapping attacks.
 */
class Saml
{
    const NS_P = 'urn:oasis:names:tc:SAML:2.0:protocol';
    const NS_A = 'urn:oasis:names:tc:SAML:2.0:assertion';
    const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
    const SKEW = 180;

    public static function cfg()
    {
        $c = App::$i->config['security']['providers']['saml'];
        if (empty($c['enabled'])) throw new HttpError(t('error.notfound'), 404);
        return $c;
    }

    public static function baseUrl()
    {
        $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        return ($https ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . strtok($_SERVER['REQUEST_URI'], '?');
    }

    public static function acsUrl() { return self::baseUrl() . '?p=saml&acs=1'; }

    public static function spEntityId(array $c) { return !empty($c['spEntityId']) ? $c['spEntityId'] : self::baseUrl() . '?p=saml&metadata=1'; }

    public static function start()
    {
        $c = self::cfg();
        $id = '_' . bin2hex(random_bytes(16));
        $_SESSION['mc_saml_req'] = $id;
        $xml = '<samlp:AuthnRequest xmlns:samlp="' . self::NS_P . '" xmlns:saml="' . self::NS_A . '" ID="' . $id . '" Version="2.0" IssueInstant="' . gmdate('Y-m-d\\TH:i:s\\Z')
            . '" Destination="' . h($c['idpSsoUrl']) . '" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" AssertionConsumerServiceURL="' . h(self::acsUrl()) . '">'
            . '<saml:Issuer>' . h(self::spEntityId($c)) . '</saml:Issuer><samlp:NameIDPolicy AllowCreate="true" Format="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified"/></samlp:AuthnRequest>';
        $q = http_build_query(['SAMLRequest' => base64_encode(gzdeflate($xml)), 'RelayState' => 'mibcrude']);
        redirect($c['idpSsoUrl'] . (strpos($c['idpSsoUrl'], '?') === false ? '?' : '&') . $q);
    }

    public static function metadata()
    {
        $c = self::cfg();
        header('Content-Type: application/samlmetadata+xml');
        echo '<?xml version="1.0"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="' . h(self::spEntityId($c)) . '">'
            . '<md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="' . self::NS_P . '">'
            . '<md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified</md:NameIDFormat>'
            . '<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="' . h(self::acsUrl()) . '" index="0"/>'
            . '</md:SPSSODescriptor></md:EntityDescriptor>';
    }

    /** Validates a base64 SAMLResponse. Returns [username, info] or throws. */
    public static function processResponse($b64, array $c, $expectedRequestId, $acs, $now = null)
    {
        $now = $now === null ? time() : $now;
        $xml = base64_decode((string)$b64, true);
        if ($xml === false || $xml === '') throw new HttpError('SAML: risposta non valida', 400);
        $prev = libxml_disable_entity_loader_compat();
        $doc = new \DOMDocument();
        $ok = $doc->loadXML($xml, LIBXML_NONET | LIBXML_NOBLANKS);
        libxml_restore_compat($prev);
        if (!$ok || $doc->doctype) throw new HttpError('SAML: XML non valido', 400);
        $x = new \DOMXPath($doc);
        $x->registerNamespace('samlp', self::NS_P);
        $x->registerNamespace('saml', self::NS_A);
        $x->registerNamespace('ds', self::NS_DS);
        $resp = $doc->documentElement;
        if ($resp->localName !== 'Response' || $resp->namespaceURI !== self::NS_P) throw new HttpError('SAML: non è una Response', 400);
        $status = $x->query('samlp:Status/samlp:StatusCode', $resp)->item(0);
        if (!$status || $status->getAttribute('Value') !== 'urn:oasis:names:tc:SAML:2.0:status:Success') throw new HttpError('SAML: accesso rifiutato dal provider', 401);
        if ($resp->hasAttribute('Destination') && $resp->getAttribute('Destination') !== $acs) throw new HttpError('SAML: destinazione errata', 401);
        if ($expectedRequestId !== null && $resp->hasAttribute('InResponseTo') && !hash_equals((string)$expectedRequestId, $resp->getAttribute('InResponseTo'))) throw new HttpError('SAML: risposta non richiesta', 401);
        $assertions = $x->query('saml:Assertion', $resp);
        if ($assertions->length !== 1) throw new HttpError('SAML: attesa una sola Assertion', 401);
        $assertion = $assertions->item(0);
        // The signature must cover the Response or the Assertion; data is read from the signed node.
        $signed = null;
        foreach ([$resp, $assertion] as $node) {
            $sig = $x->query('ds:Signature', $node)->item(0);
            if ($sig && self::verifySignature($doc, $x, $node, $sig, $c['idpCert'])) { $signed = $node; break; }
        }
        if (!$signed) throw new HttpError('SAML: firma non valida', 401);
        if ($signed === $resp) $assertion = $x->query('saml:Assertion', $resp)->item(0);
        $issuer = trim((string)$x->evaluate('string(saml:Issuer)', $assertion));
        if (!empty($c['idpEntityId']) && $issuer !== $c['idpEntityId']) throw new HttpError('SAML: emittente non riconosciuto', 401);
        $cond = $x->query('saml:Conditions', $assertion)->item(0);
        if ($cond) {
            if ($cond->hasAttribute('NotBefore') && strtotime($cond->getAttribute('NotBefore')) > $now + self::SKEW) throw new HttpError('SAML: asserzione non ancora valida', 401);
            if ($cond->hasAttribute('NotOnOrAfter') && strtotime($cond->getAttribute('NotOnOrAfter')) <= $now - self::SKEW) throw new HttpError('SAML: asserzione scaduta', 401);
            $aud = $x->query('saml:AudienceRestriction/saml:Audience', $cond);
            if ($aud->length) {
                $okAud = false;
                foreach ($aud as $a) if (trim($a->textContent) === self::spEntityId($c)) $okAud = true;
                if (!$okAud) throw new HttpError('SAML: audience errata', 401);
            }
        }
        $sc = $x->query('saml:Subject/saml:SubjectConfirmation/saml:SubjectConfirmationData', $assertion)->item(0);
        if ($sc && $sc->hasAttribute('NotOnOrAfter') && strtotime($sc->getAttribute('NotOnOrAfter')) <= $now - self::SKEW) throw new HttpError('SAML: asserzione scaduta', 401);
        $attrs = [];
        foreach ($x->query('saml:AttributeStatement/saml:Attribute', $assertion) as $a) {
            foreach ($x->query('saml:AttributeValue', $a) as $v) $attrs[$a->getAttribute('Name')][] = trim($v->textContent);
        }
        $nameId = trim((string)$x->evaluate('string(saml:Subject/saml:NameID)', $assertion));
        $username = !empty($c['usernameAttr']) && !empty($attrs[$c['usernameAttr']][0]) ? $attrs[$c['usernameAttr']][0] : $nameId;
        if ($username === '') throw new HttpError('SAML: utente mancante', 401);
        $get = function ($k) use ($c, $attrs) { return !empty($c[$k]) && !empty($attrs[$c[$k]][0]) ? $attrs[$c[$k]][0] : ''; };
        return [$username, ['email' => $get('emailAttr'), 'fullname' => $get('nameAttr') ?: $username,
            'groups' => !empty($c['groupAttr']) && isset($attrs[$c['groupAttr']]) ? $attrs[$c['groupAttr']] : [], 'groupMap' => isset($c['groupMap']) ? $c['groupMap'] : []]];
    }

    /** XML-DSig enveloped signature over $node, checked with the PEM certificate. */
    public static function verifySignature(\DOMDocument $doc, \DOMXPath $x, \DOMElement $node, \DOMElement $sig, $certPem)
    {
        $si = $x->query('ds:SignedInfo', $sig)->item(0);
        if (!$si) return false;
        $refs = $x->query('ds:Reference', $si);
        if ($refs->length !== 1) return false;
        $ref = $refs->item(0);
        $uri = $ref->getAttribute('URI');
        $id = $node->getAttribute('ID');
        if ($id === '' || $uri !== '#' . $id) return false;
        // Only one element may carry this ID (signature wrapping).
        if ($x->query('//*[@ID="' . str_replace('"', '', $id) . '"]')->length !== 1) return false;
        $alg = $x->evaluate('string(ds:SignatureMethod/@Algorithm)', $si);
        $digAlg = $x->evaluate('string(ds:DigestMethod/@Algorithm)', $ref);
        $digest = base64_decode(trim($x->evaluate('string(ds:DigestValue)', $ref)));
        $value = base64_decode(preg_replace('/\s+/', '', $x->evaluate('string(ds:SignatureValue)', $sig)));
        foreach ($x->query('ds:Transforms/ds:Transform', $ref) as $tr) {
            if (!in_array($tr->getAttribute('Algorithm'), ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#', 'http://www.w3.org/2001/10/xml-exc-c14n#WithComments'], true)) return false;
        }
        // Digest of the node without its Signature (enveloped), exclusive canonicalisation.
        $copy = new \DOMDocument();
        $copy->appendChild($copy->importNode($node, true));
        $cx = new \DOMXPath($copy);
        $cx->registerNamespace('ds', self::NS_DS);
        foreach ($cx->query('/*/ds:Signature') as $s) $s->parentNode->removeChild($s);
        $c14n = $copy->documentElement->C14N(true, false);
        $hash = ['http://www.w3.org/2001/04/xmlenc#sha256' => 'sha256', 'http://www.w3.org/2000/09/xmldsig#sha1' => 'sha1'][$digAlg] ?? null;
        if (!$hash || !hash_equals(hash($hash, $c14n, true), $digest)) return false;
        $signAlg = ['http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' => OPENSSL_ALGO_SHA256, 'http://www.w3.org/2000/09/xmldsig#rsa-sha1' => OPENSSL_ALGO_SHA1][$alg] ?? null;
        if (!$signAlg) return false;
        $pem = trim($certPem);
        if (strpos($pem, '-----BEGIN') === false) $pem = "-----BEGIN CERTIFICATE-----\n" . chunk_split(preg_replace('/\s+/', '', $pem), 64, "\n") . "-----END CERTIFICATE-----\n";
        $key = openssl_pkey_get_public($pem);
        if (!$key) return false;
        return openssl_verify($si->C14N(true, false), $value, $key, $signAlg) === 1;
    }

    public static function acs()
    {
        $c = self::cfg();
        $req = isset($_SESSION['mc_saml_req']) ? $_SESSION['mc_saml_req'] : null;
        unset($_SESSION['mc_saml_req']);
        list($username, $info) = self::processResponse(isset($_POST['SAMLResponse']) ? $_POST['SAMLResponse'] : '', $c, $req, self::acsUrl());
        $user = App::$i->security->upsertExternal('saml', $username, $info);
        if (!$user) throw new HttpError(t('login.inactive'), 403);
        App::$i->security->startUserSession($user);
        redirect(App::$i->url('home'));
    }
}

// PHP 8 removed libxml_disable_entity_loader (external entities are off by default since libxml 2.9).
function libxml_disable_entity_loader_compat()
{
    return PHP_VERSION_ID < 80000 && function_exists('libxml_disable_entity_loader') ? @libxml_disable_entity_loader(true) : null;
}

function libxml_restore_compat($prev)
{
    if ($prev !== null && PHP_VERSION_ID < 80000) @libxml_disable_entity_loader($prev);
}
