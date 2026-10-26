import "./print.css";

export function ShopHeader({ details: shop, gstin, logo }) {
  if (!shop) return null;
  return (
    <header className="m-shop-print-header" aria-label="Shop details">
      <div className="m-shop-print-brand">
        <div className="m-shop-print-name">
          {logo && (
            <img className="m-invoice-logo" src={logo} alt={shop.name} />
          )}
          <h2>{shop.name}</h2>
        </div>
        <p className="m-shop-print-phones">{shop.phones.join(" · ")}</p>
      </div>
      <div className="m-shop-print-offering">
        <p className="m-shop-print-title">{shop.businessTitle}</p>
        <p className="m-shop-print-services">{shop.services.join(" · ")}</p>
      </div>
      <div className="m-shop-print-contact">
        <p>{shop.address}</p>
        <p>
          <a href={`mailto:${shop.email}`}>{shop.email}</a>
        </p>
      </div>
      {gstin && <p className="m-shop-print-gstin">GSTIN: {gstin}</p>}
    </header>
  );
}
