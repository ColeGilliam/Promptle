import { NavbarComponent } from './navbar';

describe('NavbarComponent theme', () => {
  it('toggleTheme should be capable of switching from dark/light mode and persist it', () => {
    console.log('Running test: toggleTheme should be capable of switching from dark/light mode and persist it');

    const component = new NavbarComponent({} as any, {} as any);
    localStorage.removeItem('promptle-theme');
    document.body.classList.remove('dark');

    const errors: string[] = [];

    component.toggleTheme();
    if (component.isDarkTheme !== true) errors.push('First toggle did not switch to dark mode.');
    if (localStorage.getItem('promptle-theme') !== 'dark') errors.push('First toggle did not persist "dark".');
    if (!document.body.classList.contains('dark')) errors.push('First toggle did not apply dark class.');

    component.toggleTheme();
    if (component.isDarkTheme !== false) errors.push('Second toggle did not switch back to light mode.');
    if (localStorage.getItem('promptle-theme') !== 'light') errors.push('Second toggle did not persist "light".');
    if (document.body.classList.contains('dark')) errors.push('Second toggle did not remove dark class.');

    if (errors.length) {
      console.error(`FAIL: ${errors[0]}`);
    } else {
      console.log('PASS: Theme toggled and persisted correctly.');
    }

    expect(errors.length).withContext(errors[0] ?? '').toBe(0);
  });
});
