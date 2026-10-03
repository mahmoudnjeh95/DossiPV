import { requireAuthenticatedCompanyUser } from '../layout';
import { logoutAction } from '../actions';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();

  return (
    <main>
      <h1>Bienvenue, {user.fullName}</h1>
      <form action={logoutAction}>
        <button type="submit">Se déconnecter</button>
      </form>
    </main>
  );
}
