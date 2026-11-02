"""Integration checks: run with python3 tests/trial-days.test.py after lovable auth-session."""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    with open(Path.home() / ".cache/lovable-auth/session.json") as file:
        session = json.load(file)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await page.goto("http://localhost:8080")
        await page.evaluate("([k,v]) => localStorage.setItem(k,v)", [session["storage_key"], json.dumps(session["session"])])
        await page.goto("http://localhost:8080/usuarios")
        await page.wait_for_function('document.querySelector("#trial-days")?.disabled === false')
        result = await page.evaluate("""async () => {
          const { supabase } = await import('/src/integrations/supabase/client.ts');
          const { data: settings, error: readError } = await supabase.from('app_settings').select('trial_days').eq('id',1).single();
          if (readError) throw new Error(readError.message);
          const before = await supabase.from('licenses').select('user_id,expires_at,has_network').order('user_id');
          if (before.error) throw new Error(before.error.message);
          const checks = {};
          try {
            const set = await supabase.rpc('set_trial_days', {_days:14});
            if (set.error) throw new Error(set.error.message);
            const expiry = await supabase.rpc('new_trial_expires_at', {_started_at:'2026-11-02T12:00:00Z'});
            checks.configuredDuration = !expiry.error && new Date(expiry.data).toISOString() === '2026-11-16T12:00:00.000Z';
            const zero = await supabase.rpc('set_trial_days', {_days:0});
            const disabled = await supabase.rpc('new_trial_expires_at', {_started_at:'2026-11-02T12:00:00Z'});
            checks.zeroDisablesTrial = !zero.error && !disabled.error && new Date(disabled.data).toISOString() === '2026-11-02T12:00:00.000Z';
            checks.invalidDurationRejected = !!(await supabase.rpc('set_trial_days', {_days:-1})).error && !!(await supabase.rpc('set_trial_days', {_days:366})).error;
            const after = await supabase.from('licenses').select('user_id,expires_at,has_network').order('user_id');
            checks.existingAccountsUnchanged = !after.error && JSON.stringify(before.data) === JSON.stringify(after.data);
          } finally {
            const restore = await supabase.rpc('set_trial_days', {_days:settings.trial_days});
            if (restore.error) throw new Error('Failed to restore original trial configuration');
          }
          await supabase.auth.signOut({scope:'local'});
          checks.anonymousCannotChangeTrial = !!(await supabase.rpc('set_trial_days', {_days:14})).error;
          return checks;
        }""")
        for name, passed in result.items():
            assert passed, name
            print("PASS:", name)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())