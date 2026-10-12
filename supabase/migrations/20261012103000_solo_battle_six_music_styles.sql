-- Extend the existing battle preference and track selector from 3 to 6 musical styles.
-- Minimal in-place updates to three existing SQL function definitions. No direct
-- modifications to participant data, completed matches, scores, or song history.
-- Solo still presents exactly four choices, with three distractors unchanged.
-- Existing grants, safety checks and anti-repeat mechanisms remain intact.
DO $loki_six_themes$
DECLARE
  v_oid regprocedure;
  v_old text;
  v_new text;
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'public.keep_battle_save_match_preferences(text[],integer)',
    'public.keep_battle_solo_pack(text,integer,text[])',
    'public.keep_battle_arena_seed_rounds(uuid,integer)'
  ]
  LOOP
    v_oid := to_regprocedure(v_name);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Loki battle function missing: %', v_name;
    END IF;
    v_old := pg_get_functiondef(v_oid);
    IF v_name LIKE '%keep_battle_arena_seed_rounds%' THEN
      IF strpos(v_old, 'and u.ord <= 3') = 0 THEN
        RAISE EXCEPTION 'Loki battle seed limiter changed unexpectedly: %', v_name;
      END IF;
      v_new := replace(v_old, 'and u.ord <= 3', 'and u.ord <= 6');
    ELSE
      v_new := regexp_replace(
        v_old,
        '(group by upper\(trim\(code\)\)\s+order by min\(ord\)\s+)limit 3',
        '\1limit 6',
        'i'
      );
    END IF;
    IF v_old = v_new THEN
      RAISE EXCEPTION 'Loki battle style limiter was not updated: %', v_name;
    END IF;
    IF v_new NOT ILIKE '%SECURITY DEFINER%' THEN
      RAISE EXCEPTION 'Loki battle function security unexpectedly changed: %', v_name;
    END IF;
    EXECUTE v_new;
  END LOOP;
END;
$loki_six_themes$;
