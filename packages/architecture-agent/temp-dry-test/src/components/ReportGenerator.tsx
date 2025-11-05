
export function ReportGenerator({ data }: { data: any[] }) {
  const processedData = data.map(item => ({
    ...item,
    processed: true,
    timestamp: Date.now()
  }));

  return (
    <div>
      <h1>Generated Report</h1>
      {processedData.map(item => (
        <div key={item.id}>
          <span>{item.name}</span>
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
    