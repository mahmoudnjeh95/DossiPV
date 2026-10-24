import { redirect } from 'next/navigation';

export default function SupplierHomePage(): never {
  redirect('/fournisseur/produits');
}
