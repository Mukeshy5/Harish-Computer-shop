import "./print.css";

export function ShopHeader({ details: shop, gstin, logo }) {
  if (!shop) return null;
  return (
    <header className="m-shop-print-header" aria-label="Shop details">
      {logo && <img className="m-invoice-logo" src={logo} alt={shop.name} />}
      <h2>{shop.name}</h2>
      <p className="m-shop-print-phones">{shop.phones.join(" · ")}</p>
      <p className="m-shop-print-title">{shop.businessTitle}</p>
      <p className="m-shop-print-services">{shop.services.join(" · ")}</p>
      <p>{shop.address}</p>
      <p>
        <a href={`mailto:${shop.email}`}>{shop.email}</a>
      </p>
      {gstin && <p>GSTIN: {gstin}</p>}
    </header>
  );
}
