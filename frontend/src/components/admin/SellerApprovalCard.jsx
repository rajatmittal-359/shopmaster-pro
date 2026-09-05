// frontend/src/components/admin/SellerApprovalCard.jsx
export default function SellerApprovalCard({ seller, onApprove, onReject }) {
  const { _id, businessName, kycStatus, userId } = seller;

  return (
    <div className="border rounded-lg p-4 flex justify-between items-center mb-3">
      <div>
        <p className="font-semibold">{businessName}</p>
        <p className="text-sm text-gray-600">
          {userId?.name} • {userId?.email}
        </p>
        <p className="text-xs text-gray-500">KYC: {kycStatus}</p>
      </div>
      <div className="space-x-2">
        <button
          onClick={() => onApprove(_id)}
          className="px-3 py-1 text-sm bg-positive text-white rounded-lg"
        >
          Approve
        </button>
        <button
          onClick={() => onReject(_id)}
          className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
