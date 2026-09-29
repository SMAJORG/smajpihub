import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AirplanemodeActiveRoundedIcon from "@mui/icons-material/AirplanemodeActiveRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import FlightLandRoundedIcon from "@mui/icons-material/FlightLandRounded";
import FlightTakeoffRoundedIcon from "@mui/icons-material/FlightTakeoffRounded";
import LuggageRoundedIcon from "@mui/icons-material/LuggageRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import AirlineSeatReclineNormalRoundedIcon from "@mui/icons-material/AirlineSeatReclineNormalRounded";
import { transportApi, type FlightBooking } from "../../lib/transportApi";
import { requestPiBrowserHandoff } from "../../lib/piBrowserHandoff";
import { isPiPaymentAvailable } from "../../lib/soloHost";
import { formatServicePrice, piFromUsdt } from "../../lib/piPricing";
import "./FlightsPage.css";

type Flight = {
  id: string;
  airline: string;
  code: string;
  mark: string;
  depart: string;
  arrive: string;
  duration: string;
  stops: string;
  price: number;
  bookable: boolean;
};

const airportName = (value: string) => value.split("—")[0]?.trim() || value;

const defaultFlight: Flight = {
  id: "SA104",
  airline: "SMAJ Air Connect",
  code: "SA 104",
  mark: "SA",
  depart: "08:20",
  arrive: "11:05",
  duration: "6h 45m",
  stops: "1 stop · ACC",
  price: 184.6,
  bookable: false,
};

const FlightsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const stage = location.pathname.split("/flights/")[1] || "search";
  const [tripType, setTripType] = useState("Round trip");
  const [from, setFrom] = useState("Lagos (LOS) — Murtala Muhammed");
  const [to, setTo] = useState("London (LHR) — Heathrow");
  const [departure, setDeparture] = useState("2026-08-14");
  const [returnDate, setReturnDate] = useState("2026-08-24");
  const [travellers, setTravellers] = useState(1);
  const [cabin, setCabin] = useState("Economy");
  const [flights, setFlights] = useState<Flight[]>([defaultFlight]);
  const [selected, setSelected] = useState<Flight>(defaultFlight);
  const [passenger, setPassenger] = useState({ firstName: "", lastName: "", email: "", nationality: "" });
  const [seat, setSeat] = useState("18A");
  const [bag, setBag] = useState("Cabin bag");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<FlightBooking | null>(null);
  const [issuedBooking, setIssuedBooking] = useState<FlightBooking | null>(null);

  const extras = useMemo(() => (seat === "18A" ? 4.2 : 0) + (bag === "Checked 23 kg" ? 12.5 : 0), [bag, seat]);
  const total = selected.price * travellers + extras;

  useEffect(() => {
    const mockFlights: Flight[] = [
      {
        id: "SA104",
        airline: "SMAJ Air Connect",
        code: "SA 104",
        mark: "SA",
        depart: "08:20",
        arrive: "11:05",
        duration: "6h 45m",
        stops: "1 stop · ACC",
        price: 184.6,
        bookable: false,
      },
      {
        id: "PA228",
        airline: "Pioneer Airlines",
        code: "PA 228",
        mark: "PA",
        depart: "11:40",
        arrive: "17:15",
        duration: "9h 35m",
        stops: "1 stop · CMN",
        price: 206.4,
        bookable: false,
      },
      {
        id: "AO610",
        airline: "Africa Orbit",
        code: "AO 610",
        mark: "AO",
        depart: "21:10",
        arrive: "05:40",
        duration: "5h 30m",
        stops: "Direct",
        price: 238.9,
        bookable: false,
      },
    ];
    setFlights(mockFlights);
  }, []);

  const search = (event: FormEvent) => {
    event.preventDefault();
    if (!from.trim() || !to.trim() || !departure) {
      setError("Add your airports and departure date.");
      return;
    }
    setError("");
    navigate("/services/transport/flights/results");
  };

  const continuePassenger = async (event: FormEvent) => {
    event.preventDefault();
    if (!passenger.firstName || !passenger.lastName || !passenger.email || !passenger.nationality) {
      setError("Complete all passenger details to continue.");
      return;
    }
    setError("");
    navigate("/services/transport/flights/checkout");
  };

  const handleCheckout = async () => {
    if (!selected.bookable) {
      setError("This is demo inventory. Payment and ticket issuance are disabled until a live airline provider confirms the fare.");
      return;
    }
    if (!terms) {
      setError("Accept the booking conditions to continue.");
      return;
    }
    if (!isPiPaymentAvailable()) {
      setError("Open SMAJ PI HUB in Pi Browser to pay and issue your ticket.");
      requestPiBrowserHandoff("Pi payment required for flight ticket");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const booking = pendingBooking || await transportApi.createFlightBooking({
        airline: selected.airline,
        flightCode: selected.code,
        departureAirport: from,
        arrivalAirport: to,
        departureTime: `${departure} ${selected.depart}`,
        arrivalTime: `${departure} ${selected.arrive}`,
        duration: selected.duration,
        cabin,
        seat,
        baggage: bag,
        passengerName: `${passenger.firstName} ${passenger.lastName}`,
        passengerEmail: passenger.email,
        passengerNationality: passenger.nationality,
        farePi: piFromUsdt(total),
        fareUsd: total,
      });
      setPendingBooking(booking);
      await window.Pi!.authenticate(["payments"], () => setError("An incomplete Pi payment was found. Finish or cancel it before retrying."));
      await window.Pi!.createPayment(
        {
          amount: booking.farePi,
          memo: `SMAJ flight ${booking.flightCode} (${booking.bookingId})`,
          metadata: { bookingId: booking.bookingId, type: "flight" },
        },
        {
          onReadyForServerApproval: async paymentId => {
            await transportApi.approveFlightPayment(booking.bookingId, paymentId);
          },
          onReadyForServerCompletion: async (paymentId, txid) => {
            try {
              const issued = await transportApi.completeFlightPayment(booking.bookingId, paymentId, txid);
              setIssuedBooking(issued);
              setPendingBooking(issued);
              navigate("/services/transport/flights/ticket");
            } catch (completionError) {
              setError(completionError instanceof Error ? completionError.message : "Payment confirmation failed. Please contact support with your Pi transaction ID.");
            }
          },
          onCancel: paymentId => {
            void transportApi.cancelFlightPayment(booking.bookingId, paymentId);
            setPendingBooking(null);
            setError("Pi payment was cancelled. No ticket was issued.");
          },
          onError: paymentError => {
            setError(paymentError.message || "Pi payment failed. No ticket was issued.");
          },
        },
      );
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Booking failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const searchScreen = (
    <div className="flight-search-page">
      <section className="flight-search-hero">
        <div>
          <span>FLIGHTS BY SMAJ TRANSPORT</span>
          <h1>
            Go further.
            <br />
            <em>Fly with confidence.</em>
          </h1>
          <p>Compare trusted airlines, reserve your journey, and pay securely in Pi.</p>
        </div>
        <aside>
          <AirplanemodeActiveRoundedIcon />
          <b>One booking</b>
          <small>Flight + airport transfer + Pi payment</small>
        </aside>
      </section>
      <form className="flight-search-card" onSubmit={search}>
        <div className="flight-trip-types">
          {["Round trip", "One way", "Multi-city"].map(type => (
            <button
              type="button"
              className={tripType === type ? "active" : ""}
              onClick={() => setTripType(type)}
              key={type}
            >
              {type}
            </button>
          ))}
        </div>
        <div className="flight-search-fields">
          <label>
            <span>FROM</span>
            <div>
              <FlightTakeoffRoundedIcon />
              <input value={from} onChange={event => setFrom(event.target.value)} />
            </div>
          </label>
          <button
            className="flight-swap"
            type="button"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            ⇄
          </button>
          <label>
            <span>TO</span>
            <div>
              <FlightLandRoundedIcon />
              <input value={to} onChange={event => setTo(event.target.value)} />
            </div>
          </label>
          <label>
            <span>DEPART</span>
            <div>
              <ScheduleRoundedIcon />
              <input type="date" value={departure} onChange={event => setDeparture(event.target.value)} />
            </div>
          </label>
          {tripType !== "One way" ? (
            <label>
              <span>RETURN</span>
              <div>
                <ScheduleRoundedIcon />
                <input type="date" value={returnDate} onChange={event => setReturnDate(event.target.value)} />
              </div>
            </label>
          ) : null}
          <label>
            <span>TRAVELLERS</span>
            <div>
              <PersonRoundedIcon />
              <select value={travellers} onChange={event => setTravellers(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6].map(count => (
                  <option value={count} key={count}>
                    {count} traveller{count > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label>
            <span>CABIN</span>
            <div>
              <AirlineSeatReclineNormalRoundedIcon />
              <select value={cabin} onChange={event => setCabin(event.target.value)}>
                {["Economy", "Premium economy", "Business", "First"].map(value => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </div>
          </label>
        </div>
        {error ? <p className="flight-error">{error}</p> : null}
        <button className="flight-primary" type="submit">
          Search flights <ArrowForwardRoundedIcon />
        </button>
      </form>
      <section className="flight-benefits">
        <article>
          <CheckCircleRoundedIcon />
          <div>
            <b>Demo flight inventory</b>
            <small>Provider connection required before public sale</small>
          </div>
        </article>
        <article>
          <PaymentsRoundedIcon />
          <div>
            <b>Transparent Pi totals</b>
            <small>Taxes and fees shown upfront</small>
          </div>
        </article>
        <article>
          <LuggageRoundedIcon />
          <div>
            <b>Flexible extras</b>
            <small>Seats and baggage in one booking</small>
          </div>
        </article>
      </section>
    </div>
  );

  const resultsScreen = (
    <section className="flight-workspace">
      <header className="flight-workspace-header">
        <button onClick={() => navigate("/services/transport/flights")}>
          <ArrowBackRoundedIcon />
        </button>
        <div>
          <small>
            {tripType.toUpperCase()} · {travellers} TRAVELLER · {cabin.toUpperCase()}
          </small>
          <h1>
            {airportName(from)} <span>→</span> {airportName(to)}
          </h1>
          <p>
            {departure}
            {tripType !== "One way" ? ` — ${returnDate}` : ""}
          </p>
        </div>
        <button className="flight-edit" onClick={() => navigate("/services/transport/flights")}>
          Edit search
        </button>
      </header>
      <div className="flight-results-layout">
        <aside className="flight-filters">
          <h3>Filter flights</h3>
          <label>
            Stops
            <select>
              <option>Any number</option>
              <option>Direct only</option>
              <option>Up to 1 stop</option>
            </select>
          </label>
          <label>
            Departure time
            <input type="range" min="0" max="24" defaultValue="20" />
          </label>
          <label>
            <input type="checkbox" defaultChecked /> Include checked bag
          </label>
          <label>
            <input type="checkbox" /> Refundable fares only
          </label>
        </aside>
        <div className="flight-results">
          <div className="flight-results-top">
            <div>
              <b>{flights.length} flights found</b>
              <small>Prices shown per traveller</small>
            </div>
            <select>
              <option>Recommended</option>
              <option>Lowest price</option>
              <option>Shortest duration</option>
            </select>
          </div>
          {flights.map((flight, index) => (
            <article className={selected.id === flight.id ? "selected" : ""} key={flight.id}>
              <div className="flight-airline">
                <span>{flight.mark}</span>
                <div>
                  <b>{flight.airline}</b>
                  <small>{flight.code}</small>
                </div>
              </div>
              <div className="flight-time">
                <strong>{flight.depart}</strong>
                <small>{airportName(from)}</small>
              </div>
              <div className="flight-duration">
                <small>{flight.duration}</small>
                <span />
                <small>{flight.stops}</small>
              </div>
              <div className="flight-time">
                <strong>{flight.arrive}</strong>
                <small>{airportName(to)}</small>
              </div>
              <div className="flight-fare">
                <small>{index === 0 ? "BEST VALUE" : "PER TRAVELLER"}</small>
                <strong>{formatServicePrice(flight.price)}</strong>
                <button
                  onClick={() => {
                    setSelected(flight);
                    navigate("/services/transport/flights/passengers");
                  }}
                >
                  {flight.bookable ? "Select" : "Preview"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );

  const passengerScreen = (
    <section className="flight-workspace flight-details-page">
      <header className="flight-workspace-header">
        <button onClick={() => navigate("/services/transport/flights/results")}>
          <ArrowBackRoundedIcon />
        </button>
        <div>
          <small>STEP 2 OF 3</small>
          <h1>Passenger details</h1>
          <p>Enter names exactly as shown on the travel document.</p>
        </div>
      </header>
      <div className="flight-details-layout">
        <form className="flight-passenger-form" onSubmit={continuePassenger}>
          <h2>Adult passenger 1</h2>
          <div>
            <label>
              <span>FIRST NAME</span>
              <input
                value={passenger.firstName}
                onChange={event => setPassenger({ ...passenger, firstName: event.target.value })}
                placeholder="Given name"
              />
            </label>
            <label>
              <span>LAST NAME</span>
              <input
                value={passenger.lastName}
                onChange={event => setPassenger({ ...passenger, lastName: event.target.value })}
                placeholder="Family name"
              />
            </label>
            <label>
              <span>EMAIL FOR TICKET</span>
              <input
                type="email"
                value={passenger.email}
                onChange={event => setPassenger({ ...passenger, email: event.target.value })}
                placeholder="name@example.com"
              />
            </label>
            <label>
              <span>NATIONALITY</span>
              <input
                value={passenger.nationality}
                onChange={event => setPassenger({ ...passenger, nationality: event.target.value })}
                placeholder="Country"
              />
            </label>
          </div>
          <h2>Travel extras</h2>
          <div>
            <label>
              <span>SEAT</span>
              <select value={seat} onChange={event => setSeat(event.target.value)}>
                <option>18A</option>
                <option>No preference</option>
              </select>
            </label>
            <label>
              <span>BAGGAGE</span>
              <select value={bag} onChange={event => setBag(event.target.value)}>
                <option>Cabin bag</option>
                <option>Checked 23 kg</option>
              </select>
            </label>
          </div>
          {error ? <p className="flight-error">{error}</p> : null}
          <button className="flight-primary">
            Continue to payment <ArrowForwardRoundedIcon />
          </button>
        </form>
        <FlightSummary flight={selected} from={from} to={to} total={total} travellers={travellers} />
      </div>
    </section>
  );

  const checkoutScreen = (
    <section className="flight-workspace flight-details-page">
      <header className="flight-workspace-header">
        <button onClick={() => navigate("/services/transport/flights/passengers")}>
          <ArrowBackRoundedIcon />
        </button>
        <div>
          <small>STEP 3 OF 3</small>
          <h1>Review and pay</h1>
          <p>Demo checkout preview. No seat is held and no payment will be taken.</p>
        </div>
      </header>
      <div className="flight-details-layout">
        <div className="flight-checkout-card">
          <span className="flight-secure">
            <CheckCircleRoundedIcon /> SECURE PI CHECKOUT
          </span>
          <h2>Pay with Pi Wallet</h2>
          <div className="flight-wallet">
            <span>π</span>
            <div>
              <b>Connected Pi Wallet</b>
              <small>pioneer@smaj · Ready</small>
            </div>
            <CheckCircleRoundedIcon />
          </div>
          <div className="flight-price-lines">
            <p>
              <span>{travellers} × flight fare</span>
              <b>{formatServicePrice(selected.price * travellers)}</b>
            </p>
            <p>
              <span>Seat and baggage</span>
              <b>{formatServicePrice(extras)}</b>
            </p>
            <p>
              <span>Taxes and service fees</span>
              <b>Included</b>
            </p>
            <p>
              <strong>Total</strong>
              <strong>{formatServicePrice(total)}</strong>
            </p>
          </div>
          <label className="flight-terms">
            <input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} />
            <span>I confirm the passenger details and accept the fare, change, and cancellation conditions.</span>
          </label>
          {error ? <p className="flight-error">{error}</p> : null}
          <button className="flight-primary" onClick={handleCheckout} disabled={loading}>
            {loading ? "Processing payment…" : `Pay ${formatServicePrice(total)} and issue ticket`}
          </button>
        </div>
        <FlightSummary flight={selected} from={from} to={to} total={total} travellers={travellers} />
      </div>
    </section>
  );

  const ticketScreen = (
    <section className="flight-ticket-page">
      <div className="flight-success">
        <span>
          <CheckCircleRoundedIcon />
        </span>
        <small>BOOKING CONFIRMED</small>
        <h1>Your trip is booked.</h1>
        <p>Your paid electronic ticket is ready below for {passenger.email || "your email"}.</p>
      </div>
      <article className="flight-ticket">
        <header>
          <div>
            <span>SMJ</span>
            <b>
              SMAJ
              <br />
              TRANSPORT
            </b>
          </div>
          <div>
            <small>BOOKING REFERENCE</small>
            <strong>{issuedBooking?.ticketNumber || issuedBooking?.bookingId}</strong>
          </div>
        </header>
        <div className="ticket-route">
          <div>
            <strong>{airportName(from).match(/\((.*?)\)/)?.[1] || "LOS"}</strong>
            <small>{airportName(from)}</small>
            <b>{selected.depart}</b>
          </div>
          <span>
            <AirplanemodeActiveRoundedIcon />
          </span>
          <div>
            <strong>{airportName(to).match(/\((.*?)\)/)?.[1] || "LHR"}</strong>
            <small>{airportName(to)}</small>
            <b>{selected.arrive}</b>
          </div>
        </div>
        <div className="ticket-data">
          <p>
            <small>PASSENGER</small>
            <b>
              {passenger.firstName || "SMAJ"} {passenger.lastName || "PIONEER"}
            </b>
          </p>
          <p>
            <small>DATE</small>
            <b>{departure}</b>
          </p>
          <p>
            <small>FLIGHT</small>
            <b>{selected.code}</b>
          </p>
          <p>
            <small>SEAT</small>
            <b>{seat}</b>
          </p>
          <p>
            <small>CABIN</small>
            <b>{cabin}</b>
          </p>
          <p>
            <small>TOTAL PAID</small>
            <b>{formatServicePrice(total)}</b>
          </p>
        </div>
        <footer>
          <div className="ticket-barcode">|||| ||| || ||||| | |||| |||</div>
          <span>Electronic ticket · Confirmation sent to {passenger.email || "your email"}</span>
        </footer>
      </article>
      <div className="flight-ticket-actions">
        <button onClick={() => window.print()}>Download ticket</button>
        <button className="flight-primary" onClick={() => navigate("/services/transport")}>
          Book airport ride
        </button>
      </div>
    </section>
  );

  if (stage === "results") return resultsScreen;
  if (stage === "passengers") return passengerScreen;
  if (stage === "checkout") return checkoutScreen;
  if (stage === "ticket") return issuedBooking ? ticketScreen : checkoutScreen;
  return searchScreen;
};

const FlightSummary = ({
  flight,
  from,
  to,
  total,
  travellers,
}: {
  flight: Flight;
  from: string;
  to: string;
  total: number;
  travellers: number;
}) => (
  <aside className="flight-booking-summary">
    <span>YOUR FLIGHT</span>
    <div className="flight-summary-airline">
      <i>{flight.mark}</i>
      <div>
        <b>{flight.airline}</b>
        <small>{flight.code}</small>
      </div>
    </div>
    <div className="flight-summary-route">
      <strong>{flight.depart}</strong>
      <span />
      <strong>{flight.arrive}</strong>
      <small>{airportName(from)}</small>
      <small>{airportName(to)}</small>
    </div>
    <p>
      {flight.duration} · {flight.stops}
    </p>
    <p>
      {travellers} traveller{travellers > 1 ? "s" : ""}
    </p>
    <footer>
      <span>Booking total</span>
      <strong>{formatServicePrice(total)}</strong>
    </footer>
  </aside>
);

export default FlightsPage;
