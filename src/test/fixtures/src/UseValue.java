package demo;
import org.springframework.beans.factory.annotation.Value;

public class UseValue {
    @Value("${kks.retry-delay}")
    private int delay;
}
