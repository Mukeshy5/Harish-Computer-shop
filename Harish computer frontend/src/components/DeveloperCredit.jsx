import { Link } from "react-router-dom";

export default function DeveloperCredit({ className = "" }) {
  return (
    <span className={className}>
      Developed by <Link to="/developer">Mukesh Yadav</Link>
      <span aria-hidden="true"> · </span>
      <a href="tel:+918052344204">8052344204</a>
    </span>
  );
}
