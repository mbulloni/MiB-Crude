<?php
namespace MiB;

/** "Edit as" controls for add/edit/search forms. */
class Controls
{
    public static function render(Table $t, array $f, $value, $mode, array $opts = [])
    {
        $n = $f['name'];
        $ea = $f['editAs'];
        $type = $ea['type'];
        $id = 'f_' . preg_replace('/\W/', '_', $n);
        $name = isset($opts['name']) ? $opts['name'] : $n;
        $req = !empty($f['validation']['required']) && $mode !== 'search' ? ' required' : '';
        $ph = isset($ea['placeholder']) ? $t->app->label($ea['placeholder']) : '';
        $attr = ' id="' . h($id) . '" name="' . h($name) . '"' . ($ph !== '' ? ' placeholder="' . h($ph) . '"' : '');
        $inv = !empty($opts['error']) ? ' is-invalid' : '';
        $v = $value === null ? '' : (string)$value;

        if ($mode === 'search') {
            if (in_array($type, ['textarea', 'richtext', 'password', 'readonly', 'hidden', 'file', 'image'], true)) $type = 'text';
            if ($type === 'checkboxes' || $type === 'radio' || $type === 'autocomplete') $type = 'select';
            if (in_array($f['type'], ['int', 'decimal'], true) && $type !== 'select') $type = 'number';
        }

        switch ($type) {
            case 'readonly':
                $shown = $v;
                if ($t->lookupDef($f)) { $o = $t->lookupOptions($f, '', null, 0, [$v]); $shown = $o ? $o[0]['label'] : $v; }
                return '<input type="text" class="form-control-plaintext" readonly value="' . h($shown) . '">';
            case 'hidden':
                return '<input type="hidden"' . $attr . ' value="' . h($v) . '">';
            case 'textarea':
                $rows = isset($ea['rows']) ? (int)$ea['rows'] : 5;
                return '<textarea class="form-control' . $inv . '"' . $attr . $req . ' rows="' . $rows . '">' . h($v) . '</textarea>';
            case 'richtext':
                return '<div class="mc-rte" data-target="' . h($id) . '"></div><textarea class="form-control d-none mc-rte-src' . $inv . '"' . $attr . '>' . h($v) . '</textarea>';
            case 'password':
                return '<input type="password" class="form-control' . $inv . '"' . $attr . ($mode === 'add' ? $req : '') . ' autocomplete="new-password"'
                    . ($mode === 'edit' ? ' placeholder="' . h(t('form.password_keep')) . '"' : '') . '>';
            case 'checkbox':
                if ($mode === 'search') {
                    return '<select class="form-select"' . $attr . '><option value=""></option><option value="1"' . ($v === '1' ? ' selected' : '') . '>' . h(t('yes'))
                        . '</option><option value="0"' . ($v === '0' ? ' selected' : '') . '>' . h(t('no')) . '</option></select>';
                }
                return '<div class="form-check form-switch"><input type="checkbox" class="form-check-input" value="1"' . $attr . ($v !== '' && $v !== '0' ? ' checked' : '') . '></div>';
            case 'number':
                $step = isset($ea['step']) ? $ea['step'] : ($f['type'] === 'int' ? '1' : 'any');
                return '<input type="number" class="form-control' . $inv . '"' . $attr . $req . ' step="' . h($step) . '" value="' . h($v) . '"'
                    . self::minmax($f) . '>';
            case 'date':
                return '<input type="date" class="form-control' . $inv . '"' . $attr . $req . ' value="' . h(substr($v, 0, 10)) . '">';
            case 'datetime':
                return '<input type="datetime-local" class="form-control' . $inv . '"' . $attr . $req . ' value="' . h($v !== '' ? str_replace(' ', 'T', substr($v, 0, 16)) : '') . '">';
            case 'time':
                return '<input type="time" class="form-control' . $inv . '"' . $attr . $req . ' value="' . h(substr($v, 0, 5)) . '">';
            case 'email':
                return '<input type="email" class="form-control' . $inv . '"' . $attr . $req . ' value="' . h($v) . '">';
            case 'color':
                return '<input type="color" class="form-control form-control-color' . $inv . '"' . $attr . ' value="' . h($v !== '' ? $v : '#000000') . '">';
            case 'select':
            case 'radio':
            case 'checkboxes':
            case 'autocomplete':
                return self::lookup($t, $f, $v, $mode, $type, $attr, $id, $name, $req, $inv, $opts);
            case 'file':
            case 'image':
                return self::upload($t, $f, $value, $mode, $id, $name, $inv, $opts);
        }
        $max = !empty($ea['maxLength']) ? ' maxlength="' . (int)$ea['maxLength'] . '"' : '';
        $pattern = !empty($f['validation']['regex']) && $mode !== 'search' ? ' pattern="' . h($f['validation']['regex']) . '"' : '';
        return '<input type="text" class="form-control' . $inv . '"' . $attr . $req . $max . $pattern . ' value="' . h($v) . '">';
    }

    private static function minmax($f)
    {
        $s = '';
        if (isset($f['validation']['min']) && $f['validation']['min'] !== '') $s .= ' min="' . h($f['validation']['min']) . '"';
        if (isset($f['validation']['max']) && $f['validation']['max'] !== '') $s .= ' max="' . h($f['validation']['max']) . '"';
        return $s;
    }

    private static function lookup(Table $t, array $f, $v, $mode, $type, $attr, $id, $name, $req, $inv, array $opts)
    {
        $lk = $t->lookupDef($f);
        if (!$lk) return '<input type="text" class="form-control"' . $attr . ' value="' . h($v) . '">';
        $dep = !empty($lk['dependsOn']['field']) ? $lk['dependsOn']['field'] : '';
        $parent = null;
        if ($dep !== '' && isset($opts['row'][$dep])) $parent = $opts['row'][$dep];
        $lookupUrl = $t->app->url('lookup', ['t' => $t->name, 'f' => $f['name']]);
        $data = ' data-lookup="' . h($lookupUrl) . '"' . ($dep ? ' data-depends="f_' . h(preg_replace('/\W/', '_', $dep)) . '"' : '');
        $selected = $v === '' ? [] : array_map('trim', explode(',', $v));

        if ($type === 'autocomplete') {
            $label = '';
            if ($v !== '') { $o = $t->lookupOptions($f, '', null, 0, [$v]); $label = $o ? $o[0]['label'] : $v; }
            return '<div class="mc-autocomplete"' . $data . '><input type="text" class="form-control mc-ac-text' . $inv . '" autocomplete="off" value="' . h($label) . '"' . $req . '>'
                . '<input type="hidden" name="' . h($name) . '" id="' . h($id) . '" value="' . h($v) . '"><div class="list-group mc-ac-list"></div></div>';
        }
        $options = ($dep !== '' && $parent === null && $mode !== 'search') ? [] : $t->lookupOptions($f, '', $dep !== '' && $mode !== 'search' ? $parent : null, 2000);
        $addNew = '';
        if (!empty($lk['addNew']) && $lk['kind'] === 'table' && $t->app->hasTable($lk['table']) && $t->app->security->can($lk['table'], 'A') && $mode !== 'search') {
            $addNew = '<a class="btn btn-outline-secondary mc-addnew" title="' . h(t('btn.add')) . '" data-target="' . h($id) . '" href="'
                . h($t->app->url('add', ['t' => $lk['table'], 'popup' => 1])) . '"><i class="bi bi-plus-lg"></i></a>';
        }
        if ($type === 'radio' || $type === 'checkboxes') {
            $multi = $type === 'checkboxes';
            $html = '<div class="mc-choices" id="' . h($id) . '"' . $data . '>';
            foreach ($options as $i => $o) {
                $oid = $id . '_' . $i;
                $html .= '<div class="form-check form-check-inline"><input class="form-check-input" type="' . ($multi ? 'checkbox' : 'radio') . '" name="' . h($name) . ($multi ? '[]' : '')
                    . '" id="' . h($oid) . '" value="' . h($o['value']) . '"' . (in_array($o['value'], $selected, true) ? ' checked' : '') . '>'
                    . '<label class="form-check-label" for="' . h($oid) . '">' . h($o['label']) . '</label></div>';
            }
            return $html . '</div>';
        }
        $multi = !empty($lk['multiple']);
        $html = '<select class="form-select' . $inv . '" id="' . h($id) . '" name="' . h($name) . ($multi ? '[]" multiple' : '"') . $data . $req . '><option value=""></option>';
        foreach ($options as $o) $html .= '<option value="' . h($o['value']) . '"' . (in_array($o['value'], $selected, true) ? ' selected' : '') . '>' . h($o['label']) . '</option>';
        $html .= '</select>';
        return $addNew ? '<div class="input-group">' . $html . $addNew . '</div>' : $html;
    }

    private static function upload(Table $t, array $f, $value, $mode, $id, $name, $inv, array $opts)
    {
        $up = isset($f['editAs']['upload']) ? $f['editAs']['upload'] : [];
        $multi = !empty($up['multiple']);
        $accept = '';
        if (!empty($up['types'])) $accept = ' accept="' . h(implode(',', array_map(function ($x) { return '.' . trim($x); }, explode(',', $up['types'])))) . '"';
        elseif ($f['editAs']['type'] === 'image') $accept = ' accept="image/*"';
        $html = '';
        if ($mode === 'edit' && $value !== null && $value !== '' && !empty($opts['row'])) {
            $html .= '<div class="mb-2">' . Format::html($t, $f, $opts['row'], 'view') . '</div>';
            $html .= '<div class="form-check mb-1"><input class="form-check-input" type="checkbox" name="' . h($name) . '__clear" value="1" id="' . h($id) . '_clr">'
                . '<label class="form-check-label" for="' . h($id) . '_clr">' . h(t('file.remove')) . '</label></div>';
        }
        $html .= '<input type="file" class="form-control' . $inv . '" id="' . h($id) . '" name="' . h($name) . ($multi ? '[]" multiple' : '"') . $accept . '>';
        return $html;
    }
}
